// @vitest-environment jsdom
//
// Focused a11y test for the checkout renderInput helper (fix 3.9).
// The page has many context dependencies; we mock them all minimally
// and render with one item in the cart so the shipping form is shown.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// --- module mocks ---

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

const cartItem = {
  id: "cart-1",
  workId: "work-1",
  title: "Copper Still Life",
  artistName: "Maya Chen",
  artistSlug: "maya-chen",
  image: "https://example.com/img.jpg",
  price: 450,
  quantity: 1,
  shippingPrice: null,
  internationalShippingPrice: null,
  dimensions: null,
  framed: false,
  quantityAvailable: null,
  size: null,
};

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: [cartItem],
    removeItem: vi.fn(),
    updateQuantity: vi.fn(),
    subtotal: 450,
    ready: true,
  }),
}));

vi.mock("@/lib/safe-redirect", () => ({
  safeRedirect: (_raw: unknown, fallback: string) => fallback,
}));

vi.mock("@/lib/qr-context", () => ({
  readQrContext: () => null,
}));

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ addresses: [] }),
  }),
}));

import CheckoutPage from "./page";

afterEach(() => cleanup());

describe("Checkout renderInput a11y (fix 3.9)", () => {
  beforeEach(() => {
    // Suppress expected fetch warnings (pickup lookup, address fetch)
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ artists: [] }),
    } as unknown as Response);
  });

  it("each renderInput field has an <input> with an id and a matching <label htmlFor>", async () => {
    render(<CheckoutPage />);

    // Give the async effects time to resolve (pickup lookup, address fetch).
    await new Promise((r) => setTimeout(r, 50));

    // Only the fields rendered via the renderInput helper (postcode has
    // a bespoke inline block with extra format validation, so it is
    // excluded from this helper's scope).
    const fieldMappings: Array<[string, string]> = [
      ["checkout-fullName", "Full name"],
      ["checkout-email", "Email address"],
      ["checkout-phone", "Phone number"],
      ["checkout-addressLine1", "Address line 1"],
      ["checkout-city", "City"],
    ];

    for (const [id, labelText] of fieldMappings) {
      // Each input must be findable by its label (a11y-first query).
      const input = screen.getByLabelText(new RegExp(labelText, "i"));
      expect(input, `Input for "${labelText}" not found via getByLabelText`).toBeTruthy();
      expect(input.id).toBe(id);

      // Verify the matching label element exists with the right htmlFor.
      const label = document.querySelector(`label[for="${id}"]`);
      expect(label, `<label for="${id}"> not found`).toBeTruthy();
    }
  });
});
