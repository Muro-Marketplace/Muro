"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import type { CartItem, ShippingInfo, MockOrder } from "@/lib/types";

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "id">) => void;
  removeItem: (cartLineId: string) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
  lastOrder: MockOrder | null;
  placeOrder: (shipping: ShippingInfo) => MockOrder;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [lastOrder, setLastOrder] = useState<MockOrder | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem("wallspace-cart");
    if (stored) {
      try { setItems(JSON.parse(stored)); } catch { /* ignore */ }
    }
    const storedOrder = localStorage.getItem("wallspace-last-order");
    if (storedOrder) {
      try { setLastOrder(JSON.parse(storedOrder)); } catch { /* ignore */ }
    }
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    if (hasMounted.current) {
      localStorage.setItem("wallspace-cart", JSON.stringify(items));
    }
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, "id">) => {
    const id = "cart-" + Math.random().toString(36).slice(2, 10);
    setItems((prev) => [...prev, { ...item, id }]);
  }, []);

  const removeItem = useCallback((cartLineId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== cartLineId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const placeOrder = useCallback(
    (shipping: ShippingInfo): MockOrder => {
      const shippingCost = subtotal >= 300 ? 0 : 9.95;
      const order: MockOrder = {
        id: "WS-" + Math.random().toString().slice(2, 8),
        items: [...items],
        shipping,
        subtotal,
        shippingCost,
        total: subtotal + shippingCost,
        status: "confirmed",
        createdAt: new Date().toISOString(),
      };
      setLastOrder(order);
      localStorage.setItem("wallspace-last-order", JSON.stringify(order));
      // Append to order history
      const history = JSON.parse(localStorage.getItem("wallspace-orders") || "[]");
      history.push(order);
      localStorage.setItem("wallspace-orders", JSON.stringify(history));
      // Save to Supabase
      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          items: order.items,
          shipping: order.shipping,
          subtotal: order.subtotal,
          shippingCost: order.shippingCost,
          total: order.total,
          buyerEmail: shipping.email,
        }),
      }).catch((err) => console.error("Order save error:", err));
      setItems([]);
      return order;
    },
    [items, subtotal]
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, clearCart, itemCount, subtotal, lastOrder, placeOrder }}
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
