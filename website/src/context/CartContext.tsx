"use client";

import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
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

// Bug 15: the cart used a single global localStorage key, so it leaked
// across identities — sign in as A, add items, sign out, sign in as B, and
// B saw A's cart; a guest's cart bled into a logged-in session too. The
// cart is now scoped per identity: each user gets their own key, guests
// share one, and the persist effect writes only to the active key.
const GUEST_KEY = "wallplace-cart:guest";
const LEGACY_KEY = "wallplace-cart"; // pre-Bug-15 single global key.
const userKey = (id: string) => `wallplace-cart:u:${id}`;

// Normalise a blank/whitespace size to the canonical no-variant label so that
// addItem and mergeCarts deduplicate on the same value. Legacy-migrated carts
// can carry a blank size that addItem would have collapsed to "Original".
const normaliseSize = (s?: string) => (s && s.trim() ? s : "Original");

function readCart(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Union two carts, deduping by artistSlug+title+size and summing quantities.
// When a line carries a numeric quantityAvailable, the merged quantity is
// clamped to it so a merge can't push past live stock. Used only for the
// guest -> login transition (preserves guest-checkout-then-signup).
function mergeCarts(base: CartItem[], incoming: CartItem[]): CartItem[] {
  const result = base.map((i) => ({ ...i }));
  const indexOf = (i: CartItem) =>
    result.findIndex(
      (r) =>
        r.artistSlug === i.artistSlug &&
        r.title === i.title &&
        normaliseSize(r.size) === normaliseSize(i.size),
    );
  for (const inc of incoming) {
    const at = indexOf(inc);
    if (at === -1) {
      result.push({ ...inc, size: normaliseSize(inc.size) });
    } else {
      const merged = result[at].quantity + inc.quantity;
      const cap = result[at].quantityAvailable ?? inc.quantityAvailable;
      result[at] = {
        ...result[at],
        size: normaliseSize(result[at].size),
        quantity: typeof cap === "number" ? Math.min(merged, cap) : merged,
      };
    }
  }
  return result;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // The storage key the persist effect should write to. Kept in a ref so the
  // identity effect can point it at the new key synchronously before the
  // persist effect fires, and `null` until the first identity is resolved.
  const currentKeyRef = useRef<string | null>(null);

  // Identity effect: load (and, when appropriate, migrate/merge) the cart for
  // the current identity whenever the signed-in user changes. Runs on first
  // resolved auth and on every sign-in / sign-out / user switch.
  useEffect(() => {
    // Don't touch storage until auth has resolved — otherwise we'd load the
    // guest cart, then immediately swap to the user cart on the same paint.
    if (loading) return;

    // One-time legacy migration, only on the very first resolved run. If a
    // pre-Bug-15 global cart exists and the guest key is still empty, fold it
    // into the guest key so an in-progress guest cart survives the deploy.
    if (currentKeyRef.current === null) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy !== null) {
        if (localStorage.getItem(GUEST_KEY) === null) {
          localStorage.setItem(GUEST_KEY, legacy);
        }
        localStorage.removeItem(LEGACY_KEY);
      }
    }

    const previousKey = currentKeyRef.current;
    const isGuest = !user?.id;
    const newKey = isGuest ? GUEST_KEY : userKey(user.id);

    // Same identity (e.g. a token refresh re-fired the effect): nothing to do.
    if (newKey === previousKey) return;

    let result = readCart(newKey);

    // Guest -> login merge: a guest who added items then signed up keeps them.
    // Only on this exact transition — never on first load (null -> anything),
    // logout (user -> guest), or user -> different user.
    const isGuestToLogin =
      previousKey === GUEST_KEY && !isGuest && newKey !== GUEST_KEY;
    if (isGuestToLogin) {
      const guestCart = readCart(GUEST_KEY);
      if (guestCart.length > 0) {
        result = mergeCarts(result, guestCart);
        localStorage.removeItem(GUEST_KEY);
      }
    }

    // Point the persist effect at the new key BEFORE state updates flush, so
    // the next persist writes to the right key and never clobbers another.
    currentKeyRef.current = newKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(result);
    setReady(true);
  }, [user?.id, loading]);

  // Persist to the active identity's key on change. Gated on `ready` so we
  // never write `[]` to a key before the identity effect has loaded it.
  useEffect(() => {
    if (ready && currentKeyRef.current) {
      localStorage.setItem(currentKeyRef.current, JSON.stringify(items));
    }
  }, [items, ready]);

  const addItem = useCallback((rawItem: Omit<CartItem, "id">) => {
    // Bug 9: a missing/blank size produced a cart line that rendered as
    // "undefined" and broke dedup (two adds made two lines). Normalise to
    // the no-variant label the rest of the app uses ("Original") so every
    // line has a real size and dedups consistently.
    const item: Omit<CartItem, "id"> = {
      ...rawItem,
      size: normaliseSize(rawItem.size),
    };
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

      if (existing) {
        return prev.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + want, quantityAvailable: cap ?? i.quantityAvailable } : i
        );
      }
      const id = "cart-" + Math.random().toString(36).slice(2, 10);
      return [...prev, { ...item, id }];
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
