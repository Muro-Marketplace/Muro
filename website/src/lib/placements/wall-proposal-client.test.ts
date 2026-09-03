// The Send step's pure pieces: the arrangement choices mirror the request
// form, and the placement payload is built from what is on the wall.

import { describe, expect, it } from "vitest";
import { PAID_LOAN_MIN_GBP } from "@/lib/pricing";
import type { WallItem } from "@/lib/visualizer/types";
import {
  buildProposalPlacement,
  clampRevenueShare,
  defaultProposalMessage,
  placedSizeLabel,
  proposalTermsProblem,
  proposalVenueFromProfile,
  supportedArrangements,
  venueWallForVisualizer,
  type ProposalTerms,
} from "./wall-proposal-client";

const VENUE = {
  slug: "copper-kettle",
  name: "The Copper Kettle",
  interestedInRevenueShare: true,
  interestedInFreeLoan: true,
  interestedInDirectPurchase: true,
};

function item(id: string, workId: string, extra: Partial<WallItem> = {}): WallItem {
  return {
    id,
    work_id: workId,
    x_cm: 10,
    y_cm: 20,
    width_cm: 60.4,
    height_cm: 80.2,
    rotation_deg: 0,
    z_index: 0,
    frame: { style: "none", finish: "", depth_mm: 0 },
    ...extra,
  };
}

const WORKS = {
  "work-1": { id: "work-1", title: "Harbour Light", imageUrl: "https://images.example/harbour.jpg" },
  "work-2": { id: "work-2", title: "Low Tide", imageUrl: "https://images.example/tide.jpg" },
};

const TERMS: ProposalTerms = {
  qrEnabled: false,
  qrRevenueSharePercent: 20,
  arrangement: "revenue_share",
  revenueSharePercent: 25,
  monthlyFeeGbp: 25,
  message: "  Hi there  ",
};

describe("supportedArrangements", () => {
  it("follows the venue's flags in the form's order", () => {
    expect(supportedArrangements(VENUE)).toEqual(["revenue_share", "loan", "purchase"]);
    expect(supportedArrangements({ ...VENUE, interestedInRevenueShare: false })).toEqual(["loan", "purchase"]);
    expect(
      supportedArrangements({
        ...VENUE,
        interestedInRevenueShare: false,
        interestedInFreeLoan: false,
        interestedInDirectPurchase: false,
      }),
    ).toEqual([]);
  });
});

describe("proposalVenueFromProfile", () => {
  it("maps the snake_case profile row and falls back to the slug for a blank name", () => {
    expect(
      proposalVenueFromProfile("copper-kettle", {
        name: "The Copper Kettle",
        interested_in_revenue_share: true,
        interested_in_free_loan: null,
        interested_in_direct_purchase: "yes",
      }),
    ).toEqual({
      slug: "copper-kettle",
      name: "The Copper Kettle",
      interestedInRevenueShare: true,
      interestedInFreeLoan: false,
      interestedInDirectPurchase: false,
    });
    expect(proposalVenueFromProfile("copper-kettle", { name: "  " }).name).toBe("copper-kettle");
    expect(proposalVenueFromProfile("copper-kettle", null).name).toBe("copper-kettle");
  });
});

describe("small helpers", () => {
  it("clamps the revenue share into 0 to 100", () => {
    expect(clampRevenueShare(-5)).toBe(0);
    expect(clampRevenueShare(250)).toBe(100);
    expect(clampRevenueShare(Number.NaN)).toBe(0);
    expect(clampRevenueShare(25)).toBe(25);
  });

  it("writes the prefilled message with the venue and wall names", () => {
    expect(defaultProposalMessage("The Copper Kettle", "Front room")).toBe(
      'Hi The Copper Kettle, here\'s how my work could look on your "Front room" wall.',
    );
  });

  it("labels the placed size from the picked variant, else the rounded cm", () => {
    expect(placedSizeLabel(item("i", "w", { size_label: '16×24" (A2)' }))).toBe('16×24" (A2)');
    expect(placedSizeLabel(item("i", "w"))).toBe("60 × 80 cm");
    expect(placedSizeLabel(item("i", "w", { size_label: "  " }))).toBe("60 × 80 cm");
  });
});

describe("proposalTermsProblem", () => {
  it("accepts the defaults", () => {
    expect(proposalTermsProblem(TERMS)).toBeNull();
    expect(proposalTermsProblem({ ...TERMS, arrangement: "loan" })).toBeNull();
    expect(proposalTermsProblem({ ...TERMS, arrangement: "purchase" })).toBeNull();
  });

  it("holds a paid loan to the rent floor, allowing 0 for a free loan", () => {
    expect(proposalTermsProblem({ ...TERMS, arrangement: "loan", monthlyFeeGbp: PAID_LOAN_MIN_GBP - 1 })).toMatch(
      new RegExp(`start at £${PAID_LOAN_MIN_GBP}`),
    );
    expect(proposalTermsProblem({ ...TERMS, arrangement: "loan", monthlyFeeGbp: 0 })).toBeNull();
    expect(proposalTermsProblem({ ...TERMS, arrangement: "loan", monthlyFeeGbp: -1 })).toMatch(/monthly fee/);
  });

  it("keeps the revenue share in range and the message within the cap", () => {
    expect(proposalTermsProblem({ ...TERMS, revenueSharePercent: 101 })).toMatch(/between 0 and 100/);
    expect(proposalTermsProblem({ ...TERMS, message: "x".repeat(501) })).toMatch(/under 500/);
  });
});

describe("buildProposalPlacement", () => {
  it("mirrors the request form for a revenue share, with the placed sizes and the layout id", () => {
    const payload = buildProposalPlacement({
      placementId: "pl-1",
      venueSlug: "copper-kettle",
      items: [item("i1", "work-1", { size_label: "A2" }), item("i2", "work-2")],
      workById: WORKS,
      terms: TERMS,
      layoutId: "lay-p1",
    });
    expect(payload).toEqual({
      id: "pl-1",
      venueSlug: "copper-kettle",
      workTitle: "Harbour Light",
      workImage: "https://images.example/harbour.jpg",
      type: "revenue_share",
      qrEnabled: true,
      revenueSharePercent: 25,
      message: "Hi there",
      requestedDimensions: "A2",
      extraWorks: [{ title: "Low Tide", image: "https://images.example/tide.jpg", size: "60 × 80 cm" }],
      wallProposalLayoutId: "lay-p1",
    });
  });

  it("sends a loan as the form's free_loan value with the fee, QR off, and no revenue share", () => {
    const payload = buildProposalPlacement({
      placementId: "pl-1",
      venueSlug: "copper-kettle",
      items: [item("i1", "work-1")],
      workById: WORKS,
      terms: { ...TERMS, arrangement: "loan", monthlyFeeGbp: 40, message: "" },
      layoutId: "lay-p1",
    });
    expect(payload).toMatchObject({ type: "free_loan", qrEnabled: false, monthlyFeeGbp: 40 });
    expect(payload).not.toHaveProperty("revenueSharePercent");
    expect(payload).not.toHaveProperty("message");
    expect(payload).not.toHaveProperty("extraWorks");
  });

  it("sends a purchase with neither a share nor a fee", () => {
    const payload = buildProposalPlacement({
      placementId: "pl-1",
      venueSlug: "copper-kettle",
      items: [item("i1", "work-1")],
      workById: WORKS,
      terms: { ...TERMS, arrangement: "purchase" },
      layoutId: "lay-p1",
    });
    expect(payload).toMatchObject({ type: "purchase", qrEnabled: false });
    expect(payload).not.toHaveProperty("revenueSharePercent");
    expect(payload).not.toHaveProperty("monthlyFeeGbp");
  });

  it("skips items whose work is unknown and is null when nothing is left", () => {
    const payload = buildProposalPlacement({
      placementId: "pl-1",
      venueSlug: "copper-kettle",
      items: [item("i0", "work-gone"), item("i1", "work-1")],
      workById: WORKS,
      terms: TERMS,
      layoutId: "lay-p1",
    });
    expect(payload?.workTitle).toBe("Harbour Light");
    expect(
      buildProposalPlacement({
        placementId: "pl-1",
        venueSlug: "copper-kettle",
        items: [item("i0", "work-gone")],
        workById: WORKS,
        terms: TERMS,
        layoutId: "lay-p1",
      }),
    ).toBeNull();
  });
});

describe("venueWallForVisualizer", () => {
  it("builds a Wall the editor can seed from, with no owner or storage path", () => {
    const wall = venueWallForVisualizer({
      id: "w1",
      name: "Front room",
      width_cm: 300,
      height_cm: 240,
      kind: "uploaded",
      preset_id: null,
      wall_color_hex: "F5F1EB",
      source_image_url: "https://signed.example/front",
    });
    expect(wall).toMatchObject({
      id: "w1",
      name: "Front room",
      kind: "uploaded",
      width_cm: 300,
      height_cm: 240,
      wall_color_hex: "F5F1EB",
      user_id: "",
      source_image_path: null,
      is_public_on_profile: true,
    });
  });
});


describe("buildProposalPlacement: loans with the QR option on", () => {
  it("sends qrEnabled with the QR share as the revenue share, like the /spaces form", () => {
    const item = { id: "i1", work_id: "w1", x_cm: 0, y_cm: 0, width_cm: 60, height_cm: 40, rotation_deg: 0, z_index: 0, frame: { style: "none" } } as unknown as import("@/lib/visualizer/types").WallItem;
    const payload = buildProposalPlacement({
      placementId: "pl-qr",
      venueSlug: "v",
      items: [item],
      workById: { w1: { id: "w1", title: "One", imageUrl: "https://img/1.jpg" } },
      terms: { arrangement: "loan", revenueSharePercent: 25, monthlyFeeGbp: 40, qrEnabled: true, qrRevenueSharePercent: 20, message: "" },
      layoutId: "lay-1",
    });
    expect(payload).toMatchObject({ type: "free_loan", qrEnabled: true, monthlyFeeGbp: 40, revenueSharePercent: 20 });
  });

  it("rejects an out-of-range QR share only when the option is on", () => {
    const base = { arrangement: "loan" as const, revenueSharePercent: 25, monthlyFeeGbp: 40, message: "" };
    expect(proposalTermsProblem({ ...base, qrEnabled: true, qrRevenueSharePercent: 140 })).toMatch(/QR revenue share/);
    expect(proposalTermsProblem({ ...base, qrEnabled: false, qrRevenueSharePercent: 140 })).toBeNull();
  });
});
