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

// B18 needs a collect-from-venue basket, so the cart is mutable and reset to
// the single shipped item before each test.
let cartItems: Record<string, unknown>[] = [];

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: cartItems,
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

beforeEach(() => {
  cartItems = [cartItem];
});
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

// B18. The collect tile printed `items[0].collectVenueSlug`, so the buyer read
// "Show your order number at the-copper-kettle". The line now carries the
// venue's display name for this copy; the slug remains the claim the checkout
// API re-validates against the live placements table.
describe("collect-from-venue tile names the venue (B18)", () => {
  const collectLine = {
    ...cartItem,
    lineFulfilment: "collect_venue",
    collectVenueSlug: "the-copper-kettle",
    collectPlacementId: "p-1",
  };

  it("shows the venue's display name, not its slug", async () => {
    cartItems = [{ ...collectLine, collectVenueName: "The Copper Kettle" }];
    render(<CheckoutPage />);
    await waitFor(() =>
      expect(screen.getByText(/Show your order number at The Copper Kettle/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/the-copper-kettle/i)).toBeNull();
  });

  it("falls back to the slug for a basket built before the name existed", async () => {
    cartItems = [collectLine];
    render(<CheckoutPage />);
    await waitFor(() =>
      expect(screen.getByText(/Show your order number at the-copper-kettle/i)).toBeTruthy(),
    );
  });
});

// PASS2-placement-lifecycle-log. Under a SELECTED "Collect from the venue"
// option the page read "Your order will be fulfilled directly by the artist.
// They'll pack and ship your artwork within 5 to 7 working days." Nothing was
// going to be packed or shipped: the piece was on a wall the buyer was about to
// walk into. The confirmation page already got this right.
describe("the fulfilment notice matches the chosen fulfilment", () => {
  const collectLine = {
    ...cartItem,
    lineFulfilment: "collect_venue",
    collectVenueSlug: "the-copper-kettle",
    collectVenueName: "The Copper Kettle",
    collectPlacementId: "p-1",
  };

  it("does not promise postage on a collect-from-venue basket", async () => {
    cartItems = [collectLine];
    render(<CheckoutPage />);

    await waitFor(() =>
      expect(screen.getByText(/Show your order number at The Copper Kettle/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/pack and ship your artwork/i)).toBeNull();
  });

  it("tells the collect buyer what actually happens next", async () => {
    cartItems = [collectLine];
    render(<CheckoutPage />);

    await waitFor(() =>
      expect(screen.getByText(/collect it from The Copper Kettle/i)).toBeTruthy(),
    );
  });

  it("still promises postage on a shipped basket", async () => {
    cartItems = [cartItem];
    render(<CheckoutPage />);

    await waitFor(() =>
      expect(screen.getByText(/pack and ship your artwork/i)).toBeTruthy(),
    );
  });
});
