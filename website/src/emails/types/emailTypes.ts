// Shared types across every email template. Kept in one place so mock data,
// registry metadata, and template props all speak the same language.
//
// NB: these are DISPLAY types — what the email needs to render — not the full
// DB row. Many email payloads only carry the handful of fields they actually
// show (e.g. a WorkCard needs title + image + artist, not the full pricing[]
// or placement history).

export type EmailStream = "tx" | "notify" | "news";

export type EmailPersona = "artist" | "venue" | "customer" | "multi" | "system";

export type EmailCategory =
  | "security"
  | "legal"
  | "orders_and_payouts"
  | "placements"
  | "messages"
  | "digests"
  | "recommendations"
  | "tips"
  | "newsletter"
  | "promotions";

/** A currency amount in minor units plus the ISO code, so receipts don't fudge. */
export interface Money {
  amount: number;      // e.g. 24000 for £240.00
  currency: "GBP" | "USD" | "EUR";
}

/** Render helper — all templates should format via this, never via toLocaleString directly. */
export function formatMoney(m: Money): string {
  const symbols: Record<Money["currency"], string> = { GBP: "£", USD: "$", EUR: "€" };
  return `${symbols[m.currency]}${(m.amount / 100).toFixed(2)}`;
}

export interface Address {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postcode: string;
  country: string;
}

export interface Work {
  id: string;
  title: string;
  artistName: string;
  artistSlug: string;
  image: string;
  url: string;
  /** Display-only price string, e.g. "£240" or "From £180". Pre-formatted. */
  priceLabel?: string;
  size?: string;
}

export interface Artist {
  id: string;
  name: string;
  slug: string;
  avatar: string;
  location: string;
  primaryMedium: string;
  url: string;
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  image: string;
  location: string;
  type: string;
  url: string;
}

export interface Placement {
  id: string;
  artistName: string;
  venueName: string;
  url: string;
  workTitles: string[];
  status: "pending" | "active" | "declined" | "completed" | "cancelled";
  startDate?: string;
  endDate?: string;
  /** "Paid loan · £120/mo · 10% rev share" — pre-formatted for the email. */
  termsSummary: string;
}

export interface OrderItem {
  title: string;
  artistName: string;
  quantity: number;
  size?: string;
  image: string;
  lineTotal: Money;
}

export interface Conversation {
  id: string;
  otherPartyName: string;
  latestMessage: string;
  unreadCount: number;
  url: string;
}

export interface Review {
  reviewerName: string;
  rating: number; // 1–5
  text?: string;
  url: string;
}

/** Stat blocks in digests. `deltaPct` optional — positive = improvement. */
export interface Stat {
  label: string;
  value: string | number;
  deltaPct?: number;
}

export interface ChecklistStep {
  label: string;
  done: boolean;
  url?: string;
}

export interface TimelineEvent {
  label: string;
  description?: string;
  date?: string;
  state: "done" | "current" | "upcoming";
}

/** Canonical props all templates receive via metadata — not always rendered. */
export interface CommonEmailMeta {
  /** The account-level unsubscribe token, appended to preference links. */
  unsubscribeToken?: string;
}
