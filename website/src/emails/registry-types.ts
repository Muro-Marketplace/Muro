// The shape every template file exports as its default. The registry is just
// an array of these, so adding a template = add a file + push its default
// into the array.

import type { ComponentType } from "react";
import type { EmailCategory, EmailPersona, EmailStream } from "./types/emailTypes";

export interface TemplateEntry<P = Record<string, unknown>> {
  /** Canonical snake_case id. Used everywhere — logs, idempotency keys, preview URLs. */
  id: string;
  /** Human-readable name for the preview list. */
  name: string;
  /** Short description for the preview list — what triggers this? */
  description?: string;
  /** Sending stream — drives domain, footer, throttling. */
  stream: EmailStream;
  /** Audience — drives accent and voice. */
  persona: EmailPersona;
  /** Category — maps to preference toggles and throttle rules. */
  category: EmailCategory;
  /** Subject line. May include {{tokens}} for substitution at send time. */
  subject: string;
  /** Inbox preview text (under the subject). Keep ≤90 chars. */
  previewText: string;
  /** The React Email component. */
  component: ComponentType<P>;
  /** Default preview props. */
  mock: P;
  /** Whether this category is user-toggleable. false for security/orders/legal. */
  canUnsubscribe: boolean;
  /** Whether this event has an equivalent in-app notification. Drives send-only-if-unread logic. */
  hasInAppEquivalent: boolean;
  /** 1 = ship in MVP, 2 = near-term, 3 = later / optimisation. */
  priority: 1 | 2 | 3;
}
