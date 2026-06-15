// @vitest-environment jsdom
//
// Focused a11y test for the checkout renderInput helper (fix 3.9).
// The page has many context dependencies; we mock them all minimally
// and render with one item in the cart so the shipping form is shown.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act, fireEvent, waitFor } from "@testing-library/react";

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

describe("Checkout submit button copy (fix 7.1)", () => {
  beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ artists: [] }),
    } as unknown as Response);
  });

  it("shows the default proceed-to-payment label before submission", async () => {
    render(<CheckoutPage />);
    await new Promise((r) => setTimeout(r, 50));
    // The button text contains "Proceed to Payment" when not submitting.
    const btn = screen.getByRole("button", { name: /proceed to payment/i });
    expect(btn).toBeTruthy();
    expect(btn.textContent).toMatch(/Proceed to Payment/i);
  });

  it("shows the processing copy while submitting", async () => {
    // Stall the checkout fetch so submitting stays true long enough to assert.
    // eslint-disable-next-line prefer-const
    let checkoutResolveHolder: { fn: ((v: Response) => void) | null } = { fn: null };
    vi.spyOn(global, "fetch").mockImplementation(
      (input) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        if (url.includes("/api/checkout")) {
          return new Promise<Response>((res) => { checkoutResolveHolder.fn = res; });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ artists: [] }),
        } as unknown as Response);
      },
    );

    render(<CheckoutPage />);
    // Let pickup + address effects settle.
    await new Promise((r) => setTimeout(r, 80));

    // Fill required fields.
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Smith" } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: "07700900000" } });
    fireEvent.change(screen.getByLabelText(/address line 1/i), { target: { value: "1 High Street" } });
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "London" } });
    fireEvent.change(screen.getByLabelText(/postcode/i), { target: { value: "SW1A 1AA" } });

    // Click the submit button (non-async — just fires the event).
    fireEvent.click(screen.getByRole("button", { name: /proceed to payment/i }));

    // Wait for the submitting=true state to render.
    await waitFor(() => {
      expect(screen.getByText("Processing payment, do not refresh")).toBeTruthy();
    }, { timeout: 2000 });

    // Clean up the stalled fetch so the test teardown can finish.
    checkoutResolveHolder.fn?.({ ok: false, json: async () => ({}), status: 500 } as unknown as Response);
  });
});

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

    // Fields rendered via the renderInput helper plus the bespoke postcode
    // and country controls which each received sr-only labels in fix 3.9.
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

    // Bespoke postcode input: must be reachable by label (fix 3.9).
    const postcodeInput = screen.getByLabelText(/postcode/i);
    expect(postcodeInput, "Postcode input not found via getByLabelText").toBeTruthy();
    expect(postcodeInput.id).toBe("checkout-postcode");

    // Country select: must be reachable by label (fix 3.9).
    const countrySelect = screen.getByLabelText(/country/i);
    expect(countrySelect, "Country select not found via getByLabelText").toBeTruthy();
    expect(countrySelect.id).toBe("checkout-country");
  });
});
