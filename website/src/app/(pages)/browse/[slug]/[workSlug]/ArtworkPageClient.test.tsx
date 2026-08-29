// @vitest-environment jsdom
//
// B11: the shipping info block quoted work.shippingPrice while the cart
// lines carry effectiveShippingPrice, which prefers the SELECTED SIZE's
// own shippingPrice. An artist charging £8 on A4 and £25 on the large
// canvas had "UK shipping £8.00" printed under a large canvas the cart
// then charged £25 for.
//
// B10 is covered exhaustively in frame-uplift.test.ts; the case here is
// the wiring, that the Frame dropdown row shows the artist's explicit
// per-size override rather than the perimeter ramp.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ArtistWork } from "@/data/artists";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ addItem: vi.fn(() => ({ ok: true })), items: [] }),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, userType: null }),
}));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/components/SaveButton", () => ({ default: () => null }));
vi.mock("@/components/WallVisualiser", () => ({ default: () => null }));
vi.mock("@/components/visualizer/CustomerWallSheet", () => ({ default: () => null }));
vi.mock("@/components/offers/MakeOfferModal", () => ({ default: () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={typeof href === "string" ? href : "#"}>{children}</a>
  ),
}));

import ArtworkPageClient from "./ArtworkPageClient";

/** A work whose A4 size carries its own, cheaper, shipping price. */
function workWithPerSizeShipping(): ArtistWork {
  return {
    id: "w1",
    title: "Winter Field",
    medium: "Oil on canvas",
    dimensions: "A4",
    priceBand: "£100-£500",
    // Per-size shipping on the first (default-selected) size. The
    // work-level price is deliberately different so the two are
    // distinguishable in the rendered copy.
    pricing: [
      { label: "A4", price: 120, shippingPrice: 8 },
      { label: "100x80 cm", price: 480, shippingPrice: 25 },
    ],
    available: true,
    color: "#ccc",
    image: "https://example.test/w1.jpg",
    shippingPrice: 25,
  } as ArtistWork;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in test"))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Artwork page shipping quote (B11)", () => {
  it("quotes the selected size's own shipping price, not the work-level one", () => {
    render(
      <ArtworkPageClient
        work={workWithPerSizeShipping()}
        artistName="Alice Rivers"
        artistSlug="alice-rivers"
      />,
    );

    // A4 is selected by default and carries shippingPrice 8.
    expect(screen.getByText("UK shipping £8.00")).toBeTruthy();
    // The work-level £25 must not be what the buyer is quoted.
    expect(screen.queryByText("UK shipping £25.00")).toBeNull();
  });

  it("still uses the work-level price when the size has none", () => {
    const work = workWithPerSizeShipping();
    work.pricing = [{ label: "A4", price: 120 }];
    render(
      <ArtworkPageClient work={work} artistName="Alice Rivers" artistSlug="alice-rivers" />,
    );

    expect(screen.getByText("UK shipping £25.00")).toBeTruthy();
  });
});

describe("Artwork page frame dropdown uplift (B10)", () => {
  it("shows the artist's explicit per-size override, not the perimeter ramp", () => {
    const work = workWithPerSizeShipping();
    work.frameOptions = [
      {
        label: "Oak",
        priceUplift: 20,
        // A4 is the smallest size, so the perimeter ramp would show the
        // flat £20 here; the artist's override says £33.
        pricesBySize: { A4: 33 },
      },
    ];
    render(
      <ArtworkPageClient work={work} artistName="Alice Rivers" artistSlug="alice-rivers" />,
    );

    // The uplift is the option's description line, so open the listbox.
    fireEvent.click(screen.getByLabelText("Choose frame"));

    expect(screen.getByText("+£33")).toBeTruthy();
    expect(screen.queryByText("+£20")).toBeNull();
  });
});
