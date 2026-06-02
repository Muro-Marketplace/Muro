// @vitest-environment jsdom
//
// Bug 9: a "Buy Now" with a blank size produced a cart line that rendered
// as "undefined" and broke dedup, so two adds made two lines. addItem now
// normalises a blank size to "Original" and dedups on it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CartProvider, useCart } from "./CartContext";
import type { CartItem } from "@/lib/types";

const blankSizeItem: Omit<CartItem, "id"> = {
  type: "work",
  workId: "w1",
  artistSlug: "artist-a",
  artistName: "Artist A",
  title: "Last Light",
  image: "",
  size: "",
  price: 100,
  quantity: 1,
};

function Probe() {
  const { items, addItem } = useCart();
  return (
    <div>
      <button onClick={() => addItem(blankSizeItem)}>add</button>
      <span data-testid="count">{items.length}</span>
      <span data-testid="size">{items[0]?.size ?? ""}</span>
      <span data-testid="qty">{items[0]?.quantity ?? 0}</span>
    </div>
  );
}

describe("CartContext addItem (bug 9)", () => {
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
  });
  afterEach(cleanup);

  it("normalises a blank size to 'Original' and dedups two blank adds into one line", () => {
    render(
      <CartProvider>
        <Probe />
      </CartProvider>,
    );
    fireEvent.click(screen.getByText("add"));
    fireEvent.click(screen.getByText("add"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("size").textContent).toBe("Original");
    expect(screen.getByTestId("qty").textContent).toBe("2");
  });
});
