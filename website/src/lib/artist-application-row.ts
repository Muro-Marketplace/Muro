import type { z } from "zod";
import type { applySchema } from "@/lib/validations";

type ApplyData = z.infer<typeof applySchema>;

/**
 * Columns on `artist_applications` that are NOT NULL and carry no default.
 *
 * The form marks primary medium, portfolio link and artist statement as
 * optional, and `applySchema` matches the form, so all three arrive as `""`
 * or as `undefined` when the field is left blank. The database disagrees:
 * every one of them is NOT NULL with no default. Anything that is not a
 * string reaches Postgres as a constraint violation and the applicant gets
 * a 500 on submit.
 *
 * Two ways to get there, and the route had both:
 *   - `x || null` writes an explicit NULL,
 *   - a bare `undefined` is dropped by JSON serialisation, so the column is
 *     omitted from the INSERT, which is the same violation by another route.
 *
 * The fix for both is the same: coerce to "". If the product ever wants these
 * genuinely optional, drop the NOT NULL in a migration rather than reverting
 * this, because the form has said "optional" to applicants since launch.
 */
export const REQUIRED_APPLICATION_COLUMNS = [
  "name",
  "email",
  "location",
  "primary_medium",
  "portfolio_link",
  "artist_statement",
] as const;

/**
 * Merge `sampleWorkUrls` into `portfolio_link` until we have a dedicated
 * samples column. The portfolio link keeps its own line and the sample URLs
 * follow, so an admin reviewing the application sees everything in one place.
 */
function buildPortfolioLink(d: ApplyData): string {
  const samples = d.sampleWorkUrls
    ?.map((u) => u?.trim())
    .filter((u): u is string => !!u && u.length > 0);
  const main = d.portfolioLink?.trim() || "";
  if (!samples || samples.length === 0) return main;
  const sampleBlock = samples.map((u, i) => `Sample ${i + 1}: ${u}`).join("\n");
  return main ? `${main}\n${sampleBlock}` : sampleBlock;
}

/**
 * Build the `artist_applications` insert row from validated form data.
 *
 * Pure, so the NOT NULL invariant above can be tested without a database.
 */
export function buildArtistApplicationRow(
  d: ApplyData,
  opts: { now?: string } = {},
): Record<string, unknown> {
  const now = opts.now ?? new Date().toISOString();
  return {
    name: d.name,
    email: d.email,
    location: d.location,
    instagram: d.instagram || null,
    website: d.website || null,
    primary_medium: d.primaryMedium || "",
    discipline: d.discipline || null,
    sub_styles: d.subStyles || [],
    portfolio_link: buildPortfolioLink(d),
    artist_statement: d.artistStatement || "",
    trader_status: d.traderStatus || null,
    business_name: d.businessName || null,
    vat_number: d.vatNumber || null,
    offers_originals: d.offersOriginals || false,
    offers_prints: d.offersPrints || false,
    offers_framed: d.offersFramed || false,
    offers_commissions: d.offersCommissions || false,
    open_to_free_loan: d.openToFreeLoan || false,
    open_to_revenue_share: d.openToRevenueShare || false,
    open_to_purchase: d.openToPurchase || false,
    delivery_radius: d.deliveryRadius || null,
    venue_types: d.venueTypes || [],
    themes: d.themes || [],
    hear_about: d.hearAbout || null,
    selected_plan: d.selectedPlan || "core",
    referred_by_code: d.referralCode ? d.referralCode.toUpperCase() : null,
    // Migration 126. Only recorded when the applicant actually ticked it;
    // null means we hold no record, which is not the same as a refusal.
    acknowledged_cooling_off: d.acknowledgedCoolingOff ?? null,
    acknowledged_cooling_off_at: d.acknowledgedCoolingOff ? now : null,
    status: "pending",
    created_at: now,
  };
}
