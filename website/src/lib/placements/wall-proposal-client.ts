/**
 * Client-side half of the artist wall proposal flow: the pure pieces the
 * visualiser's Send step needs, kept free of server imports so they bundle
 * into the browser. The server half, and where a proposal is stored, is
 * src/lib/placements/wall-proposals.ts.
 *
 * The placement the Send step creates mirrors what SpacesPlacementRequestForm
 * sends for a placement, so the venue's inbox, the emails and the messages
 * thread treat both the same. The differences are deliberate: the works
 * come from the items on the wall (first item is the primary work, the rest
 * ride along as extras), the sizes are the sizes the artist placed them at,
 * and the request carries the proposal's layout id.
 */

import { PAID_LOAN_MIN_GBP } from "@/lib/pricing";
import type { Wall, WallItem } from "@/lib/visualizer/types";

/**
 * The three arrangements an artist can propose. "loan" is what the request
 * form calls `free_loan`, the paid-display arrangement with a monthly fee
 * (0 makes it a free display); it is named plainly here and mapped to the
 * API's value once, in buildProposalPlacement.
 */
export type ProposalArrangement = "revenue_share" | "loan" | "purchase";

export interface ProposalVenue {
  slug: string;
  name: string;
  interestedInRevenueShare: boolean;
  interestedInFreeLoan: boolean;
  interestedInDirectPurchase: boolean;
}

/** Exactly the `supported` derivation in SpacesPlacementRequestForm. */
export function supportedArrangements(venue: ProposalVenue): ProposalArrangement[] {
  const out: ProposalArrangement[] = [];
  if (venue.interestedInRevenueShare) out.push("revenue_share");
  if (venue.interestedInFreeLoan) out.push("loan");
  if (venue.interestedInDirectPurchase) out.push("purchase");
  return out;
}

/** The venue as GET /api/venues/[slug] returns it (snake_case row). */
export function proposalVenueFromProfile(
  slug: string,
  venue: Record<string, unknown> | null | undefined,
): ProposalVenue {
  const name = typeof venue?.name === "string" && venue.name.trim() ? venue.name.trim() : slug;
  return {
    slug,
    name,
    interestedInRevenueShare: venue?.interested_in_revenue_share === true,
    interestedInFreeLoan: venue?.interested_in_free_loan === true,
    interestedInDirectPurchase: venue?.interested_in_direct_purchase === true,
  };
}

/** The request form's defaults, kept identical so the two paths agree. */
export const DEFAULT_REVENUE_SHARE_PERCENT = 25;
export const DEFAULT_MONTHLY_FEE_GBP = 25;
export const PROPOSAL_MESSAGE_MAX = 500;

export function clampRevenueShare(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function defaultProposalMessage(venueName: string, wallName: string): string {
  return `Hi ${venueName}, here's how my work could look on your "${wallName}" wall.`;
}

/** The size the artist placed an item at, as the venue should read it. */
export function placedSizeLabel(item: Pick<WallItem, "width_cm" | "height_cm" | "size_label">): string {
  if (item.size_label && item.size_label.trim()) return item.size_label.trim();
  return `${Math.round(item.width_cm)} × ${Math.round(item.height_cm)} cm`;
}

export interface ProposalTerms {
  arrangement: ProposalArrangement;
  revenueSharePercent: number;
  monthlyFeeGbp: number;
  /**
   * Loans only: also offer the venue a share of QR-driven sales, on top of
   * the fee they pay. Same option, defaults and payload rules as the
   * placement request form on /spaces (qrEnabled true, 20%).
   */
  qrEnabled: boolean;
  qrRevenueSharePercent: number;
  message: string;
}
export const DEFAULT_QR_REVENUE_SHARE_PERCENT = 20;

/**
 * Why the terms cannot be sent yet, or null when they can. The server
 * enforces the same rules; saying them here saves a round trip that would
 * only come back as "Invalid placement data".
 */
export function proposalTermsProblem(terms: ProposalTerms): string | null {
  if (terms.arrangement === "loan") {
    const fee = terms.monthlyFeeGbp;
    if (!Number.isFinite(fee) || fee < 0) return "Enter a monthly fee, or 0 for a free loan.";
    if (fee > 0 && fee < PAID_LOAN_MIN_GBP) {
      return `Monthly loan fees start at £${PAID_LOAN_MIN_GBP}. Set 0 for a free loan.`;
    }
  }
  if (terms.arrangement === "revenue_share") {
    const share = terms.revenueSharePercent;
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      return "Revenue share must be between 0 and 100%.";
    }
  }
  if (terms.arrangement === "loan" && terms.qrEnabled) {
    const share = terms.qrRevenueSharePercent;
    if (!Number.isFinite(share) || share < 0 || share > 100) {
      return "The QR revenue share must be between 0 and 100%.";
    }
  }
  if (terms.message.length > PROPOSAL_MESSAGE_MAX) {
    return `Keep the message under ${PROPOSAL_MESSAGE_MAX} characters.`;
  }
  return null;
}

/** The little the payload needs to know about a work on the wall. */
export interface ProposalWork {
  id: string;
  title: string;
  imageUrl: string;
}

export interface ProposalPlacementPayload {
  id: string;
  venueSlug: string;
  workTitle: string;
  workImage: string;
  type: "revenue_share" | "free_loan" | "purchase";
  qrEnabled: boolean;
  message?: string;
  requestedDimensions: string;
  extraWorks?: Array<{ title: string; image: string | null; size: string | null }>;
  revenueSharePercent?: number;
  monthlyFeeGbp?: number;
  wallProposalLayoutId: string;
}

export interface BuildProposalPlacementInput {
  placementId: string;
  venueSlug: string;
  /** The items on the wall, in the order they were placed. */
  items: WallItem[];
  workById: Record<string, ProposalWork | undefined>;
  terms: ProposalTerms;
  /** The proposal layout the upload route returned. */
  layoutId: string;
}

/**
 * The placement to POST to /api/placements, or null when nothing on the
 * wall resolves to one of the artist's works. QR follows the form's rule:
 * implicit on a revenue share, off otherwise (the compact Send step has no
 * QR split control, so a loan never silently commits the artist to one).
 */
export function buildProposalPlacement(
  input: BuildProposalPlacementInput,
): ProposalPlacementPayload | null {
  const placed = input.items
    .map((item) => ({ item, work: input.workById[item.work_id] }))
    .filter((x): x is { item: WallItem; work: ProposalWork } => !!x.work);
  const first = placed[0];
  if (!first) return null;

  const { terms } = input;
  const type: ProposalPlacementPayload["type"] =
    terms.arrangement === "loan" ? "free_loan" : terms.arrangement;

  const payload: ProposalPlacementPayload = {
    id: input.placementId,
    venueSlug: input.venueSlug,
    workTitle: first.work.title,
    workImage: first.work.imageUrl,
    type,
    // QR is implicit on revenue share, opt-in on loans, off on purchase,
    // exactly as the /spaces request form sends it.
    qrEnabled:
      terms.arrangement === "revenue_share"
        ? true
        : terms.arrangement === "loan"
          ? terms.qrEnabled
          : false,
    requestedDimensions: placedSizeLabel(first.item),
    wallProposalLayoutId: input.layoutId,
  };

  const message = terms.message.trim();
  if (message) payload.message = message;

  const extras = placed.slice(1).map(({ item, work }) => ({
    title: work.title,
    image: work.imageUrl || null,
    size: placedSizeLabel(item),
  }));
  if (extras.length > 0) payload.extraWorks = extras;

  if (terms.arrangement === "revenue_share") {
    payload.revenueSharePercent = clampRevenueShare(terms.revenueSharePercent);
  } else if (terms.arrangement === "loan") {
    payload.monthlyFeeGbp = Math.max(0, terms.monthlyFeeGbp);
    if (terms.qrEnabled && terms.qrRevenueSharePercent > 0) {
      payload.revenueSharePercent = clampRevenueShare(terms.qrRevenueSharePercent);
    }
  }
  return payload;
}

/** What GET /api/venues/[slug]/walls/[wallId] says about a wall. */
export interface PublicVenueWallShape {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  preset_id: string | null;
  wall_color_hex: string;
  source_image_url?: string;
}

/**
 * The venue's public wall as the visualiser wants it. The editor reads the
 * dimensions, kind, preset and colour; the photo arrives separately as a
 * signed URL through `bgImageUrl`, so the private storage path is never
 * needed on the client and stays null.
 */
export function venueWallForVisualizer(wall: PublicVenueWallShape): Wall {
  return {
    id: wall.id,
    user_id: "",
    owner_type: "venue",
    name: wall.name,
    kind: wall.kind,
    preset_id: wall.preset_id ?? null,
    source_image_path: null,
    width_cm: wall.width_cm,
    height_cm: wall.height_cm,
    wall_color_hex: wall.wall_color_hex,
    perspective_homography: null,
    segmentation_mask_path: null,
    notes: null,
    is_public_on_profile: true,
    created_at: "",
    updated_at: "",
  };
}
