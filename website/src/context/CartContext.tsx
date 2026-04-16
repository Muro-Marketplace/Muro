"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { CartItem } from "@/lib/types";

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (cartLineId: string) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("wallplace-cart");
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    localStorage.setItem("wallplace-cart", JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, "id">) => {
    setItems((prev) => {
      // Check for duplicate: same work, same artist, same size
      const existing = prev.find(
        (i) => i.artistSlug === item.artistSlug && i.title === item.title && i.size === item.size
      );
      let next: CartItem[];
      if (existing) {
        next = prev.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i
        );
      } else {
        const id = "cart-" + Math.random().toString(36).slice(2, 10);
        next = [...prev, { ...item, id }];
      }
      // Write immediately so navigation to /checkout picks up the item
      localStorage.setItem("wallplace-cart", JSON.stringify(next));
      return next;
    });
  }, []);

  const removeItem = useCallback((cartLineId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== cartLineId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, clearCart, itemCount, subtotal }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
