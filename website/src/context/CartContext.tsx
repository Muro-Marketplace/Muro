"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { CartItem } from "@/lib/types";

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => { ok: true } | { ok: false; reason: "out-of-stock" | "exceeds-stock"; available: number };
  removeItem: (cartLineId: string) => void;
  updateQuantity: (cartLineId: string, quantity: number) => { ok: true } | { ok: false; reason: "exceeds-stock"; available: number };
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
  ready: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const hasMounted = useRef(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("wallplace-cart");
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      try { setItems(JSON.parse(stored)); } catch { /* ignore */ }
    }
    hasMounted.current = true;
    setReady(true);
  }, []);

  // Persist to localStorage on change (after mount)
  useEffect(() => {
    if (hasMounted.current) {
      localStorage.setItem("wallplace-cart", JSON.stringify(items));
    }
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, "id">) => {
    const want = item.quantity || 1;
    const cap = item.quantityAvailable;

    // Hard block: artist has marked the size out of stock.
    if (typeof cap === "number" && cap <= 0) {
      return { ok: false, reason: "out-of-stock" as const, available: 0 };
    }

    let result: { ok: true } | { ok: false; reason: "exceeds-stock"; available: number } = { ok: true };

    setItems((prev) => {
      const existing = prev.find(
        (i) => i.artistSlug === item.artistSlug && i.title === item.title && i.size === item.size
      );
      const alreadyInCart = existing?.quantity || 0;
      const totalRequested = alreadyInCart + want;

      // Respect the live stock cap when present.
      if (typeof cap === "number" && totalRequested > cap) {
        result = { ok: false, reason: "exceeds-stock", available: Math.max(0, cap - alreadyInCart) };
        return prev;
      }

      let next: CartItem[];
      if (existing) {
        next = prev.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + want, quantityAvailable: cap ?? i.quantityAvailable } : i
        );
      } else {
        const id = "cart-" + Math.random().toString(36).slice(2, 10);
        next = [...prev, { ...item, id }];
      }
      localStorage.setItem("wallplace-cart", JSON.stringify(next));
      return next;
    });

    return result;
  }, []);

  const removeItem = useCallback((cartLineId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== cartLineId));
  }, []);

  const updateQuantity = useCallback((cartLineId: string, quantity: number) => {
    let result: { ok: true } | { ok: false; reason: "exceeds-stock"; available: number } = { ok: true };
    setItems((prev) => {
      const line = prev.find((i) => i.id === cartLineId);
      if (!line) return prev;
      const cap = line.quantityAvailable;
      const next = Math.max(1, Math.min(quantity, typeof cap === "number" ? cap : quantity));
      if (typeof cap === "number" && quantity > cap) {
        result = { ok: false, reason: "exceeds-stock", available: cap };
      }
      return prev.map((i) => i.id === cartLineId ? { ...i, quantity: next } : i);
    });
    return result;
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, itemCount, subtotal, ready }}
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
