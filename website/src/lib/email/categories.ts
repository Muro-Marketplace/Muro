// Every template belongs to a category. The category drives:
//   1. which user preference toggles it (security_* can never be disabled)
//   2. which stream it sends on (security/orders -> tx, relational -> notify, editorial -> news)
//   3. how aggressively it's throttled

export type EmailCategory =
  | "security"            // verify, password reset, always sends, never throttled
  | "legal"               // ToS/privacy updates, tax docs, always sends
  | "orders_and_payouts"  // receipts, shipping, payouts, refunds, always sends
  | "placements"          // placement requests + responses, relational, user-toggleable
  | "messages"            // new conversation message, relational, toggleable
  | "digests"             // weekly performance / matches
  | "recommendations"     // artist/venue matches, new works from followed
  | "tips"                // educational, product updates
  | "newsletter"          // editorial, double opt-in
  | "promotions"          // offers, sales, explicit opt-in
  // K1: internal operational alerts to the Wallplace team. The recipient is us,
  // not a user, so no preference toggle governs it and no suppression applies —
  // an operator muting their own alerts by unsubscribing would be a foot-gun.
  | "platform_admin";

export interface CategoryRules {
  stream: "tx" | "notify" | "news";
  /** If true, bypasses preference toggles + suppressions (security/legal only). */
  criticalAlwaysSend: boolean;
  /** Max sends in this category per user per N hours. 0 = no throttle. */
  throttleCount: number;
  throttleHours: number;
}

export const CATEGORY_RULES: Record<EmailCategory, CategoryRules> = {
  security:            { stream: "tx",     criticalAlwaysSend: true,  throttleCount: 0, throttleHours: 0 },
  legal:               { stream: "tx",     criticalAlwaysSend: true,  throttleCount: 0, throttleHours: 0 },
  orders_and_payouts:  { stream: "tx",     criticalAlwaysSend: true,  throttleCount: 0, throttleHours: 0 },
  placements:          { stream: "notify", criticalAlwaysSend: false, throttleCount: 10, throttleHours: 24 },
  messages:            { stream: "notify", criticalAlwaysSend: false, throttleCount: 20, throttleHours: 24 },
  // Bumped to 8/168h so daily digests (e.g. QR scan digest) can send
  // alongside the original weekly performance digest without tripping
  // the throttle. Still capped low enough to suppress runaway batches.
  digests:             { stream: "notify", criticalAlwaysSend: false, throttleCount: 8,  throttleHours: 168 },
  recommendations:     { stream: "notify", criticalAlwaysSend: false, throttleCount: 3,  throttleHours: 168 },
  tips:                { stream: "news",   criticalAlwaysSend: false, throttleCount: 2,  throttleHours: 168 },
  newsletter:          { stream: "news",   criticalAlwaysSend: false, throttleCount: 4,  throttleHours: 720 }, // ~1/week
  promotions:          { stream: "news",   criticalAlwaysSend: false, throttleCount: 2,  throttleHours: 720 },
  platform_admin:      { stream: "tx",     criticalAlwaysSend: true,  throttleCount: 0, throttleHours: 0 },
};

// R4.12 (txn audit 4, 2026-08-28): money-consequential templates that were
// filed under `placements` at their send sites, which made them suppressible
// by a preference toggle, blockable by vacation mode and subject to the
// 10/24h throttle, all logged as ok:true skips. A purchase offer is a money
// event with an expiry; accepting or declining a placement forms or ends a
// commercial arrangement (for paid loans, a monthly liability starts at
// acceptance). The plan (WS5.5) moves them to `orders_and_payouts`, the
// critical always-send category.
//
// The override lives HERE, in the pipeline, rather than at each send site,
// because the same template is sent from more than one route (placements,
// messages) and a future send site that copies an old call would silently
// reintroduce the suppressible category. sendEmail() resolves every send
// through resolveEmailCategory(), so the registry, the send sites and the
// pipeline cannot disagree about these templates again. The registry entries
// carry the same category so the preview library tells the truth.
//
// Email audit, 2026-09-03, two further groups:
//
//   1. placement_counter_offer_received. Every other response in a placement
//      negotiation (accept, decline, cancel) is on the list above, while the
//      counter, the step that carries the revised money terms, could still be
//      dropped by the "Placement updates" toggle, vacation mode or the daily
//      cap. Same reasoning, same target.
//
//   2. Account decisions. artist_application_approved and the two blog
//      decisions (artist_blog_published, artist_blog_rejected) were sent as
//      `placements` WITH a user id, so the one message carrying the decision
//      could be silenced by the "Placement updates" toggle, vacation mode or
//      the ten-a-day cap, and pass 2 item 3.1 found a blog rejection that
//      reached its author by no route at all. They are not money, so
//      `orders_and_payouts` would mislabel them; they are account-state
//      notices, which is what `security` (tx stream, always sends, no
//      throttle, no one-click unsubscribe) is for here.
//      artist_application_rejected is sent without a user id, so no
//      preference, vacation or throttle gate ever applies to it, and it is
//      deliberately left as it is.
export const TEMPLATE_CATEGORY_OVERRIDES: Record<string, EmailCategory> = {
  offer_received_notification: "orders_and_payouts",
  artist_placement_accepted: "orders_and_payouts",
  venue_placement_accepted_confirmation: "orders_and_payouts",
  artist_placement_declined: "orders_and_payouts",
  placement_venue_declined_artist_request: "orders_and_payouts",
  placement_cancelled: "orders_and_payouts",
  placement_counter_offer_received: "orders_and_payouts",
  artist_application_approved: "security",
  artist_blog_published: "security",
  artist_blog_rejected: "security",
};

/**
 * The category a send is actually treated as. The declared category wins
 * unless the template is on the R4.12 override list above.
 */
export function resolveEmailCategory(template: string, declared: EmailCategory): EmailCategory {
  return TEMPLATE_CATEGORY_OVERRIDES[template] ?? declared;
}

/** Which preference flag governs this category. null = unsuppressible. */
export function preferenceKeyFor(category: EmailCategory): keyof {
  placements_enabled: boolean;
  messages_enabled: boolean;
  digests_enabled: boolean;
  recommendations_enabled: boolean;
  tips_enabled: boolean;
  newsletter_enabled: boolean;
  promotions_enabled: boolean;
} | null {
  switch (category) {
    case "placements":      return "placements_enabled";
    case "messages":        return "messages_enabled";
    case "digests":         return "digests_enabled";
    case "recommendations": return "recommendations_enabled";
    case "tips":            return "tips_enabled";
    case "newsletter":      return "newsletter_enabled";
    case "promotions":      return "promotions_enabled";
    default:                return null;
  }
}
