/**
 * Basic content moderation for platform messages.
 *
 * Blocked patterns  -> message is rejected outright.
 * Flagged patterns  -> message is delivered but marked for admin review.
 */

// ── Blocked patterns ──────────────────────────────────────────────────────────
// These prevent the message from being sent at all.
const BLOCKED_PATTERNS: RegExp[] = [
  // Spam / scam phrasing
  /\b(buy now|click here|free money|act now|limited time offer|congratulations you won)\b/i,
  // Excessive URLs (three or more in one message)
  /(https?:\/\/[^\s]+.*){3,}/i,
  // Phone-number solicitation that tries to move off-platform
  /\b(call me|text me|whatsapp|telegram|signal)\b.*\d{5,}/i,
  // Email harvesting
  /\b(email me at|send to|contact me at)\b.*@/i,
];

// ── Flagged patterns ──────────────────────────────────────────────────────────
// Message still goes through, but gets flagged for review.
const FLAGGED_PATTERNS: RegExp[] = [
  // Off-platform payment attempts
  /\b(paypal|venmo|cash app|bank transfer|wire transfer|western union)\b/i,
  // Explicit attempts to circumvent the platform
  /\b(pay me directly|outside (the )?platform|without wallplace|skip the fee)\b/i,
];

// ── Public types ──────────────────────────────────────────────────────────────

export interface ModerationResult {
  /** Whether the message is allowed to be sent. */
  allowed: boolean;
  /** Whether the message should be flagged for admin review. */
  flagged: boolean;
  /** Human-readable reason (only set when blocked or flagged). */
  reason?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

export function moderateMessage(content: string): ModerationResult {
  // Length guards
  if (content.trim().length < 2) {
    return { allowed: false, flagged: false, reason: "Message too short" };
  }

  if (content.length > 5000) {
    return {
      allowed: false,
      flagged: false,
      reason: "Message too long (max 5,000 characters)",
    };
  }

  // Blocked content check
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        flagged: true,
        reason: "Message contains blocked content",
      };
    }
  }

  // Flagged content check (still delivered, but tagged)
  for (const pattern of FLAGGED_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: true,
        flagged: true,
        reason:
          "Message flagged for review, may contain off-platform payment references",
      };
    }
  }

  return { allowed: true, flagged: false };
}
