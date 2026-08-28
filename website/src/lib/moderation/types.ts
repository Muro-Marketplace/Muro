// Phase 2 chunk 2.0d. Discriminated-union payload schema for the
// moderation_queue table (migration 058). Every entity_type has a
// purpose-built payload shape so the admin queue can render rows
// generically without `as any`-style casts.
//
// Used at:
//   - Write boundary: API routes that insert into moderation_queue
//     (blogs submit, feature-request form, feedback bubble) call
//     parsePayload() to guarantee the JSONB column always conforms.
//   - Read boundary: admin queue list view calls parsePayload() so
//     the renderer can switch on `type` exhaustively.

export interface BlogModerationPayload {
  type: "blog";
  blog_id: string;
  title: string;
  /** First ~200 chars of the body, plain text. Renderer doesn't need
   *  the full document on the queue list — just enough to triage. */
  excerpt: string;
}

export interface FeatureRequestModerationPayload {
  type: "feature_request";
  title: string;
  description: string;
  contact_email?: string;
  user_agent?: string;
}

export interface FeedbackModerationPayload {
  type: "feedback";
  message: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  contact_email?: string;
  /** Page the visitor was on when they submitted. */
  source_url?: string;
  user_agent?: string;
}

/**
 * Owner decision 11 (2026-08-28). A message the moderation filter flags now has
 * somewhere to go: until migration 116 widened the entity_type CHECK, the queue
 * had no member for messages, so the flag lived only in the message row's
 * metadata, queryable and watched by nobody.
 */
export interface MessageModerationPayload {
  type: "message";
  message_id: string;
  conversation_id: string;
  sender_slug: string;
  recipient_slug: string;
  /** Why the filter flagged it. */
  flag_reason: string;
  /** First ~200 chars, plain text — enough to triage, same budget as blogs. */
  excerpt: string;
}

export type ModerationPayload =
  | BlogModerationPayload
  | FeatureRequestModerationPayload
  | FeedbackModerationPayload
  | MessageModerationPayload;

export type ModerationEntityType = ModerationPayload["type"];

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRating(value: unknown): 1 | 2 | 3 | 4 | 5 | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value)) return undefined;
  if (value < 1 || value > 5) return undefined;
  return value as 1 | 2 | 3 | 4 | 5;
}

/**
 * Validate raw JSON against the ModerationPayload union. Returns null
 * when the payload is missing required fields or is the wrong shape for
 * `entityType`. Never throws.
 */
export function parsePayload(
  entityType: ModerationEntityType,
  payload: unknown,
): ModerationPayload | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  if (entityType === "blog") {
    const blogId = asString(p.blog_id);
    const title = asString(p.title);
    const excerpt = asString(p.excerpt);
    if (!blogId || !title || !excerpt) return null;
    return { type: "blog", blog_id: blogId, title, excerpt };
  }

  if (entityType === "feature_request") {
    const title = asString(p.title);
    const description = asString(p.description);
    if (!title || !description) return null;
    return {
      type: "feature_request",
      title,
      description,
      contact_email: asOptionalString(p.contact_email),
      user_agent: asOptionalString(p.user_agent),
    };
  }

  if (entityType === "message") {
    const messageId = asString(p.message_id);
    const conversationId = asString(p.conversation_id);
    const senderSlug = asString(p.sender_slug);
    const recipientSlug = asString(p.recipient_slug);
    const flagReason = asString(p.flag_reason);
    const excerpt = asString(p.excerpt);
    if (!messageId || !conversationId || !senderSlug || !recipientSlug || !flagReason || !excerpt) {
      return null;
    }
    return {
      type: "message",
      message_id: messageId,
      conversation_id: conversationId,
      sender_slug: senderSlug,
      recipient_slug: recipientSlug,
      flag_reason: flagReason,
      excerpt,
    };
  }

  if (entityType === "feedback") {
    const message = asString(p.message);
    if (!message) return null;
    return {
      type: "feedback",
      message,
      rating: asRating(p.rating),
      contact_email: asOptionalString(p.contact_email),
      source_url: asOptionalString(p.source_url),
      user_agent: asOptionalString(p.user_agent),
    };
  }

  return null;
}
