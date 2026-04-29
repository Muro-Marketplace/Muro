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
  | "promotions";         // offers, sales, explicit opt-in

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
};

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
