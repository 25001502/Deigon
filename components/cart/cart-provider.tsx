"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { calculateDisplaySubtotal } from "@/components/cart/cart-money";
import type { Product } from "@/lib/data/catalog";
import type { ApiProduct } from "@/lib/products";

type CartProduct = Pick<
  Product,
  "badge" | "handle" | "image" | "price" | "themeClass" | "title" | "vendor"
> & {
  variantId?: string;
  sku?: string;
  size?: string | null;
  color?: string | null;
  normalPrice: number;
  isOnSale: boolean;
};

type CartLine = CartProduct & {
  quantity: number;
};

type ServerCart = {
  items: Array<{
    variantId: string;
    quantity: number;
    product: {
      slug: string;
      name: string;
      vendor: string;
      collectionHandle: string;
      badge: string | null;
      images: {
        url: string;
        alt: string | null;
      }[];
    };
    variant: {
      id: string;
      sku?: string;
      size?: string | null;
      color?: string | null;
      price: number;
      normalPrice: number;
      isOnSale: boolean;
    };
  }>;
  itemCount: number;
  subtotal: number;
};

type AddItemOptions = {
  waitForServer?: boolean;
};

export class CartAuthenticationError extends Error {
  constructor() {
    super("Sign in to continue shopping.");
    this.name = "CartAuthenticationError";
  }
}

type CartContextValue = {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  readyForCheckout: boolean;
  cartSyncFailed: boolean;

  addItem: (
    product: CartProduct,
    quantity?: number,
    options?: AddItemOptions,
  ) => void | Promise<void>;

  removeItem: (handle: string) => void | Promise<void>;

  setQuantity: (
    handle: string,
    quantity: number,
  ) => void | Promise<void>;

  adjustQuantity: (
    handle: string,
    delta: number,
  ) => void | Promise<void>;

  clearCart: () => void | Promise<void>;

  clearCartLocally: () => void;

  waitForPendingMutations: () => Promise<void>;
};

const STORAGE_KEY = "deigon-cart";

const CartContext = createContext<CartContextValue | null>(null);

function cartLineKey(item: {
  handle: string;
  variantId?: string;
}) {
  return item.variantId ?? item.handle;
}

function readStoredCart() {
  if (typeof window === "undefined") {
    return [] as CartLine[];
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return [] as CartLine[];
  }

  try {
    return JSON.parse(stored) as CartLine[];
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return [] as CartLine[];
  }
}

function storePendingGuestAddition(product: CartProduct, quantity: number) {
  const stored = readStoredCart();
  const key = cartLineKey(product);
  const existing = stored.find((item) => cartLineKey(item) === key);
  const next = existing
    ? stored.map((item) => cartLineKey(item) === key
      ? { ...item, quantity: item.quantity + quantity }
      : item)
    : [...stored, { ...product, quantity }];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

type PublicProductResponse = {
  ok?: boolean;
  product?: ApiProduct;
};

export async function reconcileGuestCartLines(
  storedItems: CartLine[],
  fetchImpl: typeof fetch = fetch,
): Promise<CartLine[]> {
  const handles = [...new Set(storedItems.map((item) => item.handle).filter(Boolean))];
  const refreshed = new Map<string, ApiProduct>();

  await Promise.all(handles.map(async (handle) => {
    try {
      const response = await fetchImpl(`/api/products/${encodeURIComponent(handle)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => null)) as PublicProductResponse | null;
      if (response.ok && body?.ok && body.product) refreshed.set(handle, body.product);
    } catch {
      // A guest line remains visible as a non-authoritative estimate when refresh fails.
    }
  }));

  return storedItems.map((item) => {
    const product = refreshed.get(item.handle);
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
    if (!product || !variant) return item;

    return {
      ...item,
      title: product.name,
      vendor: product.category.name,
      badge: product.badge ?? "",
      image: [...product.images].sort((left, right) => left.position - right.position)[0]?.url,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      price: variant.price,
      normalPrice: variant.normalPrice,
      isOnSale: variant.isOnSale,
      themeClass: product.category.slug === "patron-fragrance"
        ? "theme-collection-patron"
        : "theme-collection-foxygeon",
    };
  });
}

function toCartLines(cart: ServerCart): CartLine[] {
  return cart.items.map((item) => ({
    variantId: item.variantId,
    sku: item.variant.sku,
    size: item.variant.size,
    color: item.variant.color,
    handle: item.product.slug,
    title: item.product.name,
    vendor: item.product.vendor,
    badge: item.product.badge ?? "",
    image: item.product.images[0]?.url,
    price: item.variant.price,
    normalPrice: item.variant.normalPrice,
    isOnSale: item.variant.isOnSale,
    themeClass:
      item.product.collectionHandle === "patron-fragrance"
        ? "theme-collection-patron"
        : "theme-collection-foxygeon",
    quantity: item.quantity,
  }));
}

async function requestCart(
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response
    .json()
    .catch(() => null)) as
    | {
        ok?: boolean;
        cart?: ServerCart;
        message?: string;
      }
    | null;

  if (!response.ok || !body?.ok || !body.cart) {
    throw new Error(
      body?.message ?? "Cart request failed",
    );
  }

  return body.cart;
}

async function requestCartMutation(
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const body = (await response
    .json()
    .catch(() => null)) as
    | {
        ok?: boolean;
        message?: string;
      }
    | null;

  if (response.status === 401) {
    throw new CartAuthenticationError();
  }

  if (!response.ok || body?.ok === false) {
    throw new Error(
      body?.message ?? "Cart request failed",
    );
  }
}

export function CartProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthenticated, setIsAuthenticated] =
    useState(false);
  const [cartError, setCartError] =
    useState<string | null>(null);
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  const [cartSyncFailed, setCartSyncFailed] = useState(false);

  const mergedUserRef = useRef<string | null>(null);

  /**
   * Always contains the latest optimistic cart state.
   */
  const itemsRef = useRef<CartLine[]>([]);

  /**
   * Latest authenticated user id.
   */
  const latestUserIdRef = useRef<string | null>(null);

  /**
   * Authenticated mutations execute in order.
   */
  const mutationQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );

  /**
   * Used to invalidate stale mutations.
   */
  const mutationSequenceRef = useRef(0);

  const {
    user,
    loading: authLoading,
  } = useAuth();

  /**
   * Keep latest user id synchronized after render.
   */
  useEffect(() => {
    latestUserIdRef.current =
      user?.id ?? null;
  }, [user?.id]);

  /**
   * Keep the ref synchronized with React state.
   */
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  /**
   * Immediately update both the ref and React state.
   *
   * This function is called from event handlers/effects,
   * not during render.
   */
  const commitItems = (
    next:
      | CartLine[]
      | ((
          current: CartLine[],
        ) => CartLine[]),
  ) => {
    const resolved =
      typeof next === "function"
        ? next(itemsRef.current)
        : next;

    itemsRef.current = resolved;
    setItems(resolved);
  };

  /**
   * Re-read the authoritative cart from the backend.
   *
   * This is used for reconciliation after a failed
   * optimistic mutation.
   */
  const reconcileCart = async (
    userId: string,
  ) => {
    if (
      latestUserIdRef.current !== userId
    ) {
      return;
    }

    try {
      const cart = await requestCart(
        "/api/cart",
      );

      if (
        latestUserIdRef.current !== userId
      ) {
        return;
      }

      commitItems(toCartLines(cart));
      setIsAuthenticated(true);
    } catch {
      /**
       * Keep the optimistic state if the reconciliation
       * request itself fails.
       */
    }
  };

  /**
   * Queue authenticated mutations.
   *
   * This means rapid user actions are sent to the backend
   * in the same order they were triggered.
   */
  const enqueueMutation = (
    userId: string,
    operation: () => Promise<void>,
    errorMessage: string,
    waitForServer = false,
    onAuthFailure?: () => void,
  ) => {
    const requestId =
      ++mutationSequenceRef.current;

    const task =
      mutationQueueRef.current.then(
        async () => {
          if (
            latestUserIdRef.current !==
            userId
          ) {
            if (waitForServer) {
              throw new Error("Cart session changed. Please try again.");
            }
            return;
          }

          try {
            await operation();
            if (latestUserIdRef.current !== userId && waitForServer) {
              throw new Error("Cart session changed. Please try again.");
            }
          } catch (error) {
            if (
              latestUserIdRef.current !==
              userId
            ) {
              if (waitForServer) {
                throw new Error("Cart session changed. Please try again.");
              }

              return;
            }

            const message =
              error instanceof Error
                ? error.message
                : errorMessage;

            if (error instanceof CartAuthenticationError) {
              onAuthFailure?.();
            }

            setCartError(message);

            /**
             * Only the newest failed mutation triggers
             * reconciliation.
             */
            if (
              requestId ===
              mutationSequenceRef.current
            ) {
              await reconcileCart(userId);
            }

            if (waitForServer) {
              throw error;
            }
          }
        },
      );

    /**
     * Keep the queue alive after a failed mutation.
     */
    mutationQueueRef.current =
      task.catch(() => undefined);

    return task;
  };

  /**
   * CHECKOUT BARRIER
   *
   * Checkout calls this before continuing.
   *
   * It waits until every currently queued cart mutation
   * has finished.
   */
  const waitForPendingMutations =
    async () => {
      await mutationQueueRef.current;
    };

  /**
   * Hydrate guest/authenticated cart.
   */
  useEffect(() => {
    if (authLoading) {
      return;
    }

    let mounted = true;
    let loading = false;

    /**
     * Invalidate stale mutations whenever auth identity
     * changes.
     */
    mutationSequenceRef.current += 1;

    async function loadCart() {
      if (loading) {
        return;
      }

      loading = true;
      if (mounted) setCartSyncFailed(false);

      /**
       * GUEST USER
       */
      if (!user) {
        mergedUserRef.current = null;
        const guestItems = readStoredCart();

        if (mounted) {
          setIsAuthenticated(false);
          setReadyUserId(null);
          commitItems(guestItems);
        }

        const reconciledItems = await reconcileGuestCartLines(guestItems);

        if (mounted) {
          commitItems(reconciledItems);
          setIsHydrated(true);
        }

        loading = false;
        return;
      }

      /**
       * AUTHENTICATED USER
       */
      const guestItems = readStoredCart();

      /**
       * Show guest cart while authentication cart
       * is being loaded.
       */
      if (
        mounted &&
        guestItems.length > 0
      ) {
        commitItems(guestItems);
      }

      let shouldMerge = false;

      try {
        shouldMerge =
          guestItems.length > 0 &&
          mergedUserRef.current !==
            user.id;

        if (shouldMerge) {
          mergedUserRef.current =
            user.id;
        }

        const cart = shouldMerge
          ? await requestCart(
              "/api/cart/merge",
              {
                method: "POST",
                body: JSON.stringify({
                  items:
                    guestItems.map(
                      (item) => ({
                        variantId:
                          item.variantId,
                        slug: item.handle,
                        quantity:
                          item.quantity,
                      }),
                    ),
                }),
              },
            )
          : await requestCart(
              "/api/cart",
            );

        if (!mounted) {
          return;
        }

        window.localStorage.removeItem(
          STORAGE_KEY,
        );

        setIsAuthenticated(true);
        commitItems(
          toCartLines(cart),
        );
        setReadyUserId(user.id);
      } catch {
        if (shouldMerge) {
          mergedUserRef.current = null;
        }

        if (mounted) {
          setCartSyncFailed(true);
          /**
           * Keep the visible cart instead of wiping it.
           */
          setIsAuthenticated(
            Boolean(user),
          );
        }
      } finally {
        loading = false;

        if (mounted) {
          setIsHydrated(true);
        }
      }
    }

    void loadCart();

    return () => {
      mounted = false;
    };
  }, [authLoading, user?.id]);

  /**
   * Persist guest cart to localStorage.
   */
  useEffect(() => {
    if (
      !isHydrated ||
      isAuthenticated
    ) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items),
    );
  }, [
    items,
    isAuthenticated,
    isHydrated,
  ]);

  /**
   * Clear temporary cart error.
   */
  useEffect(() => {
    if (!cartError) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        setCartError(null);
      }, 3500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [cartError]);

  const value =
    useMemo<CartContextValue>(() => {
      const subtotal = calculateDisplaySubtotal(items);

      const itemCount = items.reduce(
        (count, item) =>
          count + item.quantity,
        0,
      );

      return {
        items,
        itemCount,
        subtotal,
        readyForCheckout: !authLoading && isHydrated && Boolean(user?.id) && readyUserId === user?.id,
        cartSyncFailed,

        /**
         * ADD ITEM
         */
        addItem: (
          product,
          quantity = 1,
          options = {},
        ) => {
          const productKey =
            cartLineKey(product);

          /**
           * Optimistically add item immediately.
           */
          commitItems(
            (currentItems) => {
              const existing =
                currentItems.find(
                  (item) =>
                    cartLineKey(item) ===
                    productKey,
                );

              if (!existing) {
                return [
                  ...currentItems,
                  {
                    ...product,
                    quantity,
                  },
                ];
              }

              return currentItems.map(
                (item) =>
                  cartLineKey(item) ===
                  productKey
                    ? {
                        ...item,
                        quantity:
                          item.quantity +
                          quantity,
                      }
                    : item,
              );
            },
          );

          /**
           * Guest cart does not need an API call.
           */
          if (
            !isAuthenticated ||
            !product.variantId ||
            !user?.id
          ) {
            if (!isAuthenticated || !user?.id) {
              window.localStorage.setItem(STORAGE_KEY, JSON.stringify(itemsRef.current));
            }
            return Promise.resolve();
          }

          const userId = user.id;

          /**
           * Background server mutation.
           */
          const mutation =
            enqueueMutation(
              userId,
              () =>
                requestCartMutation(
                  "/api/cart/items",
                  {
                    method: "POST",
                    body: JSON.stringify(
                      {
                        variantId:
                          product.variantId,
                        quantity,
                      },
                    ),
                  },
                ),
              "We couldn't add that item to your cart.",
              options.waitForServer ??
                false,
              () => storePendingGuestAddition(product, quantity),
            );

          /**
           * Buy It Now can explicitly wait.
           */
          if (options.waitForServer) {
            return mutation;
          }

          /**
           * Normal Add to Cart is instant.
           */
          return Promise.resolve();
        },

        /**
         * REMOVE ITEM
         */
        removeItem: (handle) => {
          const item =
            itemsRef.current.find(
              (candidate) =>
                cartLineKey(candidate) ===
                  handle ||
                candidate.variantId ===
                  handle,
            );

          if (!item) {
            return Promise.resolve();
          }

          const variantId =
            item.variantId;

          const userId = user?.id;

          /**
           * Remove immediately from UI.
           */
          commitItems(
            (currentItems) =>
              currentItems.filter(
                (candidate) =>
                  cartLineKey(candidate) !==
                  handle,
              ),
          );

          if (
            isAuthenticated &&
            variantId &&
            userId
          ) {
            void enqueueMutation(
              userId,
              () =>
                requestCartMutation(
                  `/api/cart/items/${encodeURIComponent(
                    variantId,
                  )}`,
                  {
                    method: "DELETE",
                  },
                ),
              "We couldn't remove that item from your cart.",
            );
          }

          return Promise.resolve();
        },

        /**
         * SET ABSOLUTE QUANTITY
         */
        setQuantity: (
          handle,
          quantity,
        ) => {
          const item =
            itemsRef.current.find(
              (candidate) =>
                cartLineKey(candidate) ===
                  handle ||
                candidate.variantId ===
                  handle,
            );

          if (!item) {
            return Promise.resolve();
          }

          const safeQuantity =
            Math.max(
              0,
              Math.floor(quantity),
            );

          const variantId =
            item.variantId;

          const userId = user?.id;

          /**
           * Optimistically update immediately.
           */
          commitItems(
            (currentItems) =>
              currentItems.flatMap(
                (currentItem) => {
                  if (
                    cartLineKey(
                      currentItem,
                    ) !== handle
                  ) {
                    return currentItem;
                  }

                  if (
                    safeQuantity <= 0
                  ) {
                    return [];
                  }

                  return {
                    ...currentItem,
                    quantity:
                      safeQuantity,
                  };
                },
              ),
          );

          if (
            isAuthenticated &&
            variantId &&
            userId
          ) {
            const path =
              `/api/cart/items/${encodeURIComponent(
                variantId,
              )}`;

            if (
              safeQuantity <= 0
            ) {
              void enqueueMutation(
                userId,
                () =>
                  requestCartMutation(
                    path,
                    {
                      method: "DELETE",
                    },
                  ),
                "We couldn't remove that item from your cart.",
              );
            } else {
              void enqueueMutation(
                userId,
                () =>
                  requestCartMutation(
                    path,
                    {
                      method: "PATCH",
                      body: JSON.stringify(
                        {
                          quantity:
                            safeQuantity,
                        },
                      ),
                    },
                  ),
                "We couldn't update that item's quantity.",
              );
            }
          }

          return Promise.resolve();
        },

        /**
         * ADJUST QUANTITY
         *
         * Used by the cart page's + / - buttons.
         */
        adjustQuantity: (
          handle,
          delta,
        ) => {
          const item =
            itemsRef.current.find(
              (candidate) =>
                cartLineKey(candidate) ===
                  handle ||
                candidate.variantId ===
                  handle,
            );

          if (!item) {
            return Promise.resolve();
          }

          const nextQuantity =
            Math.max(
              0,
              item.quantity + delta,
            );

          const variantId =
            item.variantId;

          const userId = user?.id;

          /**
           * Optimistic update.
           *
           * Uses itemsRef so rapid clicks always work
           * from the newest quantity.
           */
          commitItems(
            (currentItems) =>
              currentItems.flatMap(
                (currentItem) => {
                  if (
                    cartLineKey(
                      currentItem,
                    ) !== handle
                  ) {
                    return currentItem;
                  }

                  if (
                    nextQuantity <= 0
                  ) {
                    return [];
                  }

                  return {
                    ...currentItem,
                    quantity:
                      nextQuantity,
                  };
                },
              ),
          );

          if (
            isAuthenticated &&
            variantId &&
            userId
          ) {
            const path =
              `/api/cart/items/${encodeURIComponent(
                variantId,
              )}`;

            if (
              nextQuantity <= 0
            ) {
              void enqueueMutation(
                userId,
                () =>
                  requestCartMutation(
                    path,
                    {
                      method: "DELETE",
                    },
                  ),
                "We couldn't remove that item from your cart.",
              );
            } else {
              void enqueueMutation(
                userId,
                () =>
                  requestCartMutation(
                    path,
                    {
                      method: "PATCH",
                      body: JSON.stringify(
                        {
                          quantity:
                            nextQuantity,
                        },
                      ),
                    },
                  ),
                "We couldn't update that item's quantity.",
              );
            }
          }

          return Promise.resolve();
        },

        /**
         * CLEAR CART
         */
        clearCart: () => {
          /**
           * Optimistically clear immediately.
           */
          commitItems([]);

          if (
            isAuthenticated &&
            user?.id
          ) {
            const userId = user.id;

            void enqueueMutation(
              userId,
              () =>
                requestCartMutation(
                  "/api/cart",
                  {
                    method: "DELETE",
                  },
                ),
              "We couldn't clear your cart.",
            );
          }

          return Promise.resolve();
        },

        /**
         * CHECKOUT LOCAL CLEAR
         *
         * The checkout transaction clears the server cart. This only
         * synchronizes the provider after that transaction succeeds.
         */
        clearCartLocally: () => {
          commitItems([]);
        },

        /**
         * CHECKOUT SYNCHRONIZATION BARRIER
         */
        waitForPendingMutations,
      };
    }, [
      items,
      isAuthenticated,
      user?.id,
      authLoading,
      isHydrated,
      readyUserId,
      cartSyncFailed,
    ]);

  return (
    <CartContext.Provider value={value}>
      {children}

      {cartError ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-black px-5 py-3 text-sm text-white shadow-lg"
        >
          {cartError}
        </div>
      ) : null}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context =
    useContext(CartContext);

  if (!context) {
    throw new Error(
      "useCart must be used within a CartProvider",
    );
  }

  return context;
}
