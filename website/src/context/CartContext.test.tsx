// @vitest-environment jsdom
//
// Bug 9: a "Buy Now" with a blank size produced a cart line that rendered
// as "undefined" and broke dedup, so two adds made two lines. addItem now
// normalises a blank size to "Original" and dedups on it.
//
// Bug 15: the cart used a single global localStorage key, so it leaked
// across identities — user A's cart bled into a guest, into user B, etc.
// The cart is now scoped per identity (guest vs each user id) and swaps on
// auth change, while still preserving a guest cart through sign-up (merge).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CartItem } from "@/lib/types";

// Controllable useAuth mock. `authState` is mutable so a test can flip the
// signed-in identity and re-render to simulate sign-in / sign-out / switch.
const { authState } = vi.hoisted(() => ({
  authState: { user: null as { id: string } | null, loading: false },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

// Imported AFTER the mock so CartContext picks up the mocked useAuth.
const { CartProvider, useCart } = await import("./CartContext");

const GUEST_KEY = "wallplace-cart:guest";
const LEGACY_KEY = "wallplace-cart";
const userKey = (id: string) => `wallplace-cart:u:${id}`;

const itemA: Omit<CartItem, "id"> = {
  type: "work",
  workId: "w1",
  artistSlug: "artist-a",
  artistName: "Artist A",
  title: "Last Light",
  image: "",
  size: "A2",
  price: 100,
  quantity: 1,
};

const blankSizeItem: Omit<CartItem, "id"> = {
  ...itemA,
  size: "",
};

function Probe() {
  const { items, addItem, ready } = useCart();
  return (
    <div>
      <button onClick={() => addItem(blankSizeItem)}>add-blank</button>
      <button onClick={() => addItem(itemA)}>add-a</button>
      <span data-testid="ready">{ready ? "ready" : "loading"}</span>
      <span data-testid="count">{items.length}</span>
      <span data-testid="size">{items[0]?.size ?? ""}</span>
      <span data-testid="qty">{items[0]?.quantity ?? 0}</span>
      <span data-testid="title">{items[0]?.title ?? ""}</span>
    </div>
  );
}

// A fresh element each call so React never bails on a referentially-equal
// re-render — the CartProvider re-renders, re-reads the mocked useAuth, and
// its identity effect re-runs because user?.id changed.
const tree = () => (
  <CartProvider>
    <Probe />
  </CartProvider>
);

// Render the CartProvider tree and hand back a re-render fn. After a test
// mutates authState and calls rerender(), the identity effect re-runs (deps
// include user?.id), driving the sign-in / sign-out / switch path.
function renderHarness() {
  const utils = render(tree());
  return () => utils.rerender(tree());
}

function setAuth(user: { id: string } | null, loading = false) {
  authState.user = user;
  authState.loading = loading;
}

describe("CartContext", () => {
  // Install a fresh, complete localStorage each test. Other test files
  // replace window.localStorage with a partial memory mock (no clear), and
  // with threaded workers that can leak in, so we don't rely on the ambient
  // one — a new backing store per test is also the reset.
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() {
          return store.size;
        },
      },
    });
    // Default: guest, auth resolved.
    setAuth(null, false);
  });
  afterEach(cleanup);

  describe("addItem (bug 9)", () => {
    it("normalises a blank size to 'Original' and dedups two blank adds into one line", () => {
      render(
        <CartProvider>
          <Probe />
        </CartProvider>,
      );
      fireEvent.click(screen.getByText("add-blank"));
      fireEvent.click(screen.getByText("add-blank"));
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("size").textContent).toBe("Original");
      expect(screen.getByTestId("qty").textContent).toBe("2");
    });
  });

  describe("per-identity scoping (bug 15)", () => {
    it("1. guest adds an item -> persisted under the guest key, no global key write", () => {
      setAuth(null);
      render(
        <CartProvider>
          <Probe />
        </CartProvider>,
      );
      fireEvent.click(screen.getByText("add-a"));

      expect(screen.getByTestId("count").textContent).toBe("1");
      const guest = JSON.parse(window.localStorage.getItem(GUEST_KEY) || "[]");
      expect(guest).toHaveLength(1);
      expect(guest[0].title).toBe("Last Light");
      // No leftover global write.
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it("2. guest with items signs in as A -> items merge into A's key, guest key removed, cart preserved", () => {
      setAuth(null);
      const rerender = renderHarness();
      fireEvent.click(screen.getByText("add-a"));
      expect(JSON.parse(window.localStorage.getItem(GUEST_KEY) || "[]")).toHaveLength(1);

      // Sign in as A.
      setAuth({ id: "A" });
      rerender();

      // Cart still shows the item (guest-checkout-then-signup preserved).
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("title").textContent).toBe("Last Light");
      // Item lives under A's key; guest key cleared.
      const a = JSON.parse(window.localStorage.getItem(userKey("A")) || "[]");
      expect(a).toHaveLength(1);
      expect(a[0].title).toBe("Last Light");
      expect(window.localStorage.getItem(GUEST_KEY)).toBeNull();
    });

    it("3. signed in as A, add item, then sign out -> cart empty, A's key still has the item", () => {
      setAuth({ id: "A" });
      const rerender = renderHarness();
      fireEvent.click(screen.getByText("add-a"));
      expect(JSON.parse(window.localStorage.getItem(userKey("A")) || "[]")).toHaveLength(1);

      // Sign out -> guest.
      setAuth(null);
      rerender();

      expect(screen.getByTestId("count").textContent).toBe("0");
      // A's cart is intact and was NOT copied into the guest key.
      const a = JSON.parse(window.localStorage.getItem(userKey("A")) || "[]");
      expect(a).toHaveLength(1);
      const guest = JSON.parse(window.localStorage.getItem(GUEST_KEY) || "[]");
      expect(guest).toHaveLength(0);
    });

    it("4. then sign in as B -> cart is EMPTY (B does not see A's item) [THE BUG]", () => {
      // Seed A's persisted cart and start signed in as A with the item visible.
      setAuth({ id: "A" });
      const rerender = renderHarness();
      fireEvent.click(screen.getByText("add-a"));
      expect(screen.getByTestId("count").textContent).toBe("1");

      // Switch directly to B (user -> different user: no merge, load B's empty key).
      setAuth({ id: "B" });
      rerender();

      expect(screen.getByTestId("count").textContent).toBe("0");
      // B's key is empty; A's key still holds the item.
      expect(JSON.parse(window.localStorage.getItem(userKey("B")) || "[]")).toHaveLength(0);
      expect(JSON.parse(window.localStorage.getItem(userKey("A")) || "[]")).toHaveLength(1);
    });

    it("5. then sign back in as A -> cart shows A's item again (loaded from A's key)", () => {
      // A adds an item.
      setAuth({ id: "A" });
      const rerender = renderHarness();
      fireEvent.click(screen.getByText("add-a"));
      expect(screen.getByTestId("count").textContent).toBe("1");

      // Switch to B (empty), then back to A.
      setAuth({ id: "B" });
      rerender();
      expect(screen.getByTestId("count").textContent).toBe("0");

      setAuth({ id: "A" });
      rerender();
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("title").textContent).toBe("Last Light");
    });

    it("6. legacy migration: a pre-existing global cart moves to the guest key and the global key is removed", () => {
      // Pre-seed the legacy single-key cart, then mount as guest.
      const legacy = [{ ...itemA, id: "cart-legacy1" }];
      window.localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
      setAuth(null);

      render(
        <CartProvider>
          <Probe />
        </CartProvider>,
      );

      // Cart shows the migrated item.
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("title").textContent).toBe("Last Light");
      // It now lives under the guest key and the legacy key is gone.
      const guest = JSON.parse(window.localStorage.getItem(GUEST_KEY) || "[]");
      expect(guest).toHaveLength(1);
      expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
    });

    it("does not load/swap until auth resolves (loading=true keeps ready=false)", () => {
      setAuth(null, true);
      render(
        <CartProvider>
          <Probe />
        </CartProvider>,
      );
      expect(screen.getByTestId("ready").textContent).toBe("loading");
      expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("7. corrupted JSON in a user key -> cart loads as empty (readCart try/catch guard)", () => {
      // Pre-seed a corrupt JSON string under user A's key.
      window.localStorage.setItem(userKey("A"), "{not-json");
      setAuth({ id: "A" });
      render(
        <CartProvider>
          <Probe />
        </CartProvider>,
      );
      // No throw; cart is just empty.
      expect(screen.getByTestId("ready").textContent).toBe("ready");
      expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("8. guest->login merge without quantityAvailable -> merged quantity is the sum (no clamp)", () => {
      // Guest has 2 of itemA; user A already has 1 of itemA. Neither carries
      // a quantityAvailable cap. After sign-in the merged line should be 3.
      const guestLine = { ...itemA, id: "cart-g1", quantity: 2 };
      const userLine = { ...itemA, id: "cart-u1", quantity: 1 };
      window.localStorage.setItem(GUEST_KEY, JSON.stringify([guestLine]));
      window.localStorage.setItem(userKey("A"), JSON.stringify([userLine]));

      setAuth(null);
      const rerender = renderHarness();

      // Confirm guest line is visible.
      expect(screen.getByTestId("qty").textContent).toBe("2");

      // Sign in as A -> merge fires.
      setAuth({ id: "A" });
      rerender();

      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("qty").textContent).toBe("3");
      // Guest key is cleaned up.
      expect(window.localStorage.getItem(GUEST_KEY)).toBeNull();
    });
  });
});
