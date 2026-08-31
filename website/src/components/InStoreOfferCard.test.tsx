// @vitest-environment jsdom
//
// Production pass 2, P4: "'Can buyers purchase this piece off the wall?' is
// still offered on a collected placement."
//
// Only the collapsed prompt was gated on `active`. The saved-offer row and its
// Edit button were not, so a placement whose work had come off the wall still
// offered to sell it from there, and the venue still read "Buyers can purchase
// this piece off the wall". Nothing about an off-the-wall sale means anything
// once the piece is no longer on the wall.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ supabase: { auth: {}, from: () => ({}) } }));
vi.mock("@/lib/api-client", async (orig) => {
  const actual = await orig<typeof import("@/lib/api-client")>();
  return {
    ...actual,
    authFetch: vi.fn(async () => ({ json: async () => ({}) })),
    mutate: vi.fn(async () => ({})),
  };
});

import InStoreOfferCard from "./InStoreOfferCard";

afterEach(() => cleanup());

const WITH_OFFER = {
  id: "p-1",
  status: "active",
  work_title: "Sunset",
  placed_size_label: "A2",
  venue: "The Copper Kettle",
  in_store_price: 120,
  in_store_frame_included: true,
};

const noop = () => {};

function renderCard(over: Record<string, unknown>, viewerRole: "artist" | "venue" = "artist") {
  return render(
    <InStoreOfferCard
      placement={{ ...WITH_OFFER, ...over }}
      viewerRole={viewerRole}
      promptOpen={false}
      onOpenPrompt={noop}
      onClosePrompt={noop}
      onSaved={noop}
    />,
  );
}

describe("InStoreOfferCard stands down once the piece leaves the wall", () => {
  it("offers nothing to the artist on a completed placement", () => {
    const { container } = renderCard({ status: "completed" });

    expect(container.textContent).toBe("");
  });

  it("offers nothing to the artist on a cancelled placement", () => {
    const { container } = renderCard({ status: "cancelled" });

    expect(container.textContent).toBe("");
  });

  it("tells the venue nothing about buying a piece that has gone", () => {
    const { container } = renderCard({ status: "completed" }, "venue");

    expect(container.textContent).toBe("");
  });

  it("still shows the saved offer while the placement is active", () => {
    renderCard({});

    expect(screen.getByText(/Off-the-wall sale/i)).toBeTruthy();
  });

  it("still prompts an active placement that has no offer yet", () => {
    renderCard({ in_store_price: null });

    expect(screen.getByText(/Sell this piece off the wall\?/i)).toBeTruthy();
  });
});
