// What each artist plan includes, in one place.
//
// The pricing cards rendered this list inline, and the trial-ending email
// carried its own hand-written three-line version that had drifted from the
// cards: it promised "priority matching" and "advanced QR analytics", neither
// of which is a plan feature. The email now quotes the same list the cards
// show, so the two cannot disagree again. The caps come from the modules that
// enforce them (`WORKS_CAP`, `ACTIVE_PLACEMENT_CAP`, `OUTREACH_WEEKLY_LIMIT`),
// so a cap change reprices the copy everywhere at once.
//
// Public copy: British English, no dashes as punctuation, "programme".

import { WORKS_CAP, ACTIVE_PLACEMENT_CAP } from "@/lib/pricing";
import { OUTREACH_WEEKLY_LIMIT } from "@/lib/outreach-cap";

export type PlanKey = "core" | "premium" | "pro";

export const PLAN_FEATURES: Record<PlanKey, readonly string[]> = {
  core: [
    `Up to ${ACTIVE_PLACEMENT_CAP.core} active venue placements at a time`,
    `Up to ${WORKS_CAP.core} works in your portfolio`,
    "Standard artist profile",
    `Approach ${OUTREACH_WEEKLY_LIMIT.core} new venues a week`,
    "Visibility to venues browsing the platform",
    "Basic analytics dashboard",
  ],
  premium: [
    `Up to ${ACTIVE_PLACEMENT_CAP.premium} active venue placements at a time`,
    `Up to ${WORKS_CAP.premium} works in your portfolio`,
    "Artwork of the Week: put one work at the top of the gallery for seven days",
    "Priority visibility in venue recommendations",
    `Approach ${OUTREACH_WEEKLY_LIMIT.premium} new venues a week`,
    "Full analytics, views, enquiries, conversion",
    "Priority response from the Wallplace team",
  ],
  pro: [
    "Unlimited active venue placements",
    `Up to ${WORKS_CAP.pro} works in your portfolio`,
    "Priority for programme placements, which pay monthly rent",
    "Featured artist: your profile leads the marketplace",
    "Priority visibility in venue recommendations",
    "Artwork of the Week: put one work at the top of the gallery for seven days",
    `Approach ${OUTREACH_WEEKLY_LIMIT.pro} new venues a week`,
    "Full analytics with venue breakdown and export",
    "Dedicated account support",
  ],
};

function isPlanKey(key: string): key is PlanKey {
  return key === "core" || key === "premium" || key === "pro";
}

/**
 * The feature list for a plan, by key ("premium") or display name ("Premium").
 * An unknown or missing plan reads as Core, which is what an artist without a
 * live paid plan actually has. Returns a fresh array so callers can append.
 */
export function planFeaturesFor(plan: string | null | undefined): string[] {
  const key = (plan ?? "").trim().toLowerCase();
  return [...PLAN_FEATURES[isPlanKey(key) ? key : "core"]];
}
