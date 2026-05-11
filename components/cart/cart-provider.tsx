"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Product } from "@/lib/data/catalog";

type CartLine = Pick<Product, "badge" | "handle" | "price" | "themeClass" | "title" | "vendor"> & {
  quantity: number;
};

type CartContextValue = {
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  addItem: (product: Pick<Product, "badge" | "handle" | "price" | "themeClass" | "title" | "vendor">) => void;
  removeItem: (handle: string) => void;
  setQuantity: (handle: string, quantity: number) => void;
  clearCart: () => void;
};

const STORAGE_KEY = "deigon-demo-cart";

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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>(readStoredCart);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
    const itemCount = items.reduce((count, item) => count + item.quantity, 0);

    return {
      items,
      itemCount,
      subtotal,
      addItem: (product) => {
        setItems((currentItems) => {
          const existing = currentItems.find((item) => item.handle === product.handle);

          if (!existing) {
            return [...currentItems, { ...product, quantity: 1 }];
          }

          return currentItems.map((item) =>
            item.handle === product.handle
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        });
      },
      removeItem: (handle) => {
        setItems((currentItems) => currentItems.filter((item) => item.handle !== handle));
      },
      setQuantity: (handle, quantity) => {
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
      },
      clearCart: () => {
        setItems([]);
      },
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }

  return context;
}