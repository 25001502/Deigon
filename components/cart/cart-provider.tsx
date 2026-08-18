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
import type { Product } from "@/lib/data/catalog";

type CartProduct = Pick<Product, "badge" | "handle" | "image" | "price" | "themeClass" | "title" | "vendor"> & {
  variantId?: string;
};

type CartLine = CartProduct & {
  quantity: number;
};

type ServerCart = {
  items: Array<{
    variantId: string;
    quantity: number;
    product: { slug: string; name: string; vendor: string; collectionHandle: string; badge: string | null; images: { url: string; alt: string | null }[] };
    variant: { price: number };
  }>;
  itemCount: number;
  subtotal: number;
};

type CartContextValue = {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  addItem: (product: CartProduct, quantity?: number) => void | Promise<void>;
  removeItem: (handle: string) => void | Promise<void>;
  setQuantity: (handle: string, quantity: number) => void | Promise<void>;
  clearCart: () => void | Promise<void>;
};

const STORAGE_KEY = "deigon-cart";

const CartContext = createContext<CartContextValue | null>(null);

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

function toCartLines(cart: ServerCart): CartLine[] {
  return cart.items.map((item) => ({
    variantId: item.variantId,
    handle: item.product.slug,
    title: item.product.name,
    vendor: item.product.vendor,
    badge: item.product.badge ?? "",
    image: item.product.images[0]?.url,
    price: item.variant.price,
    themeClass: item.product.collectionHandle === "patron-fragrance" ? "theme-collection-patron" : "theme-collection-foxygeon",
    quantity: item.quantity,
  }));
}

async function requestCart(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => null) as { ok?: boolean; cart?: ServerCart; message?: string } | null;
  if (!response.ok || !body?.ok || !body.cart) throw new Error(body?.message ?? "Cart request failed");
  return body.cart;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const mergedUserRef = useRef<string | null>(null);
  const mutationSequenceRef = useRef(0);
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;

    let mounted = true;
    let loading = false;
    mutationSequenceRef.current += 1;

    async function loadCart() {
      if (loading) return;
      loading = true;

      if (!user) {
        mergedUserRef.current = null;
        if (mounted) {
          setIsAuthenticated(false);
          setItems(readStoredCart());
          setIsHydrated(true);
        }
        loading = false;
        return;
      }

      const guestItems = readStoredCart();
      if (mounted && guestItems.length > 0) setItems(guestItems);
      let shouldMerge = false;

      try {
        shouldMerge = guestItems.length > 0 && mergedUserRef.current !== user.id;
        if (shouldMerge) mergedUserRef.current = user.id;
        const cart = shouldMerge
          ? await requestCart("/api/cart/merge", {
              method: "POST",
              body: JSON.stringify({ items: guestItems.map((item) => ({ variantId: item.variantId, slug: item.handle, quantity: item.quantity })) }),
            })
          : await requestCart("/api/cart");

        if (!mounted) return;
        window.localStorage.removeItem(STORAGE_KEY);
        setIsAuthenticated(true);
        setItems(toCartLines(cart));
      } catch {
        if (shouldMerge) mergedUserRef.current = null;
        if (mounted) setIsAuthenticated(false);
      } finally {
        loading = false;
        setIsHydrated(true);
      }
    }

    void loadCart();

    return () => {
      mounted = false;
    };
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (!isHydrated || isAuthenticated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, isHydrated]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
    const itemCount = items.reduce((count, item) => count + item.quantity, 0);

    return {
      items,
      itemCount,
      subtotal,
      addItem: (product, quantity = 1) => {
        if (isAuthenticated && product.variantId) {
          const userId = user?.id;
          const requestId = ++mutationSequenceRef.current;
          return requestCart("/api/cart/items", {
            method: "POST",
            body: JSON.stringify({ variantId: product.variantId, quantity }),
          }).then((cart) => {
            if (user?.id === userId && mutationSequenceRef.current === requestId) setItems(toCartLines(cart));
          }).catch(() => undefined);
        }

        setItems((currentItems) => {
          const existing = currentItems.find((item) => item.handle === product.handle);

          if (!existing) {
            return [...currentItems, { ...product, quantity }];
          }

          return currentItems.map((item) =>
            item.handle === product.handle
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          );
        });
        return Promise.resolve();
      },
      removeItem: (handle) => {
        const item = items.find((candidate) => candidate.handle === handle || candidate.variantId === handle);
        if (isAuthenticated && item?.variantId) {
          const userId = user?.id;
          const requestId = ++mutationSequenceRef.current;
          return requestCart(`/api/cart/items/${encodeURIComponent(item.variantId)}`, { method: "DELETE" })
            .then((cart) => {
              if (user?.id === userId && mutationSequenceRef.current === requestId) setItems(toCartLines(cart));
            }).catch(() => undefined);
        }
        setItems((currentItems) => currentItems.filter((candidate) => candidate.handle !== handle));
        return Promise.resolve();
      },
      setQuantity: (handle, quantity) => {
        const item = items.find((candidate) => candidate.handle === handle || candidate.variantId === handle);
        if (isAuthenticated && item?.variantId) {
          const userId = user?.id;
          const requestId = ++mutationSequenceRef.current;
          if (quantity <= 0) {
            return requestCart(`/api/cart/items/${encodeURIComponent(item.variantId)}`, { method: "DELETE" })
              .then((cart) => {
                if (user?.id === userId && mutationSequenceRef.current === requestId) setItems(toCartLines(cart));
              }).catch(() => undefined);
          } else {
            return requestCart(`/api/cart/items/${encodeURIComponent(item.variantId)}`, {
              method: "PATCH",
              body: JSON.stringify({ quantity }),
            }).then((cart) => {
              if (user?.id === userId && mutationSequenceRef.current === requestId) setItems(toCartLines(cart));
            }).catch(() => undefined);
          }
        }
        setItems((currentItems) =>
          currentItems.flatMap((item) => {
            if (item.handle !== handle) {
              return item;
            }

            if (quantity <= 0) {
              return [];
            }

            return { ...item, quantity };
          }),
        );
        return Promise.resolve();
      },
      clearCart: () => {
        if (isAuthenticated) {
          const userId = user?.id;
          const requestId = ++mutationSequenceRef.current;
          return requestCart("/api/cart", { method: "DELETE" })
            .then((cart) => {
              if (user?.id === userId && mutationSequenceRef.current === requestId) setItems(toCartLines(cart));
            }).catch(() => undefined);
        }
        setItems([]);
        return Promise.resolve();
      },
    };
  }, [items, isAuthenticated, user?.id]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}