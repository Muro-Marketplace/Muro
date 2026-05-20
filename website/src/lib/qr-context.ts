// Cross-page persistence of "this session came from a QR scan at venue X".
//
// Why this exists: the QR-scan visitor lands on /browse/[artist] with
// `?ref=qr&venue=<slug>&venueName=<name>` on the URL, then clicks a Buy
// button. Buy buttons push to `/checkout?backTo=<encoded prior URL>`,
// which means the venue context is no longer on the current URL by the
// time the checkout page reads `window.location.search`. Without that
// context the /api/checkout POST sends `venueSlug=""`, the webhook's
// placement lookup misses, and the venue's revenue-share cut is silently
// dropped to zero.
//
// Solution: stash the QR context in localStorage the moment the artist
// page sees `ref=qr`, and read it back on the checkout page. A 24h TTL
// keeps the attribution fresh, after that the visitor is treated as a
// direct buyer regardless of any stale tab.

const STORAGE_KEY = "wallplace:qr-context";
const TTL_MS = 24 * 60 * 60 * 1000;

export interface QrContext {
  /** Venue slug as stored in `venue_profiles.slug`. Drives the
   *  placement lookup at checkout. */
  venueSlug: string;
  /** Display name, for "Seen in {venue}" UI. Optional. */
  venueName?: string;
  /** Free-text attribution source. Currently always "qr". */
  source: string;
  /** Epoch ms when this entry was written. */
  ts: number;
}

export function saveQrContext(ctx: Omit<QrContext, "ts">): void {
  if (typeof window === "undefined") return;
  try {
    const row: QrContext = { ...ctx, ts: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
  } catch {
    /* localStorage full or disabled, swallow */
  }
}

export function readQrContext(): QrContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<QrContext>;
    if (!parsed || typeof parsed.venueSlug !== "string" || !parsed.venueSlug) {
      return null;
    }
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > TTL_MS) {
      // Expired, evict so the next caller sees a clean slate.
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      venueSlug: parsed.venueSlug,
      venueName: typeof parsed.venueName === "string" ? parsed.venueName : undefined,
      source: typeof parsed.source === "string" ? parsed.source : "qr",
      ts: parsed.ts,
    };
  } catch {
    return null;
  }
}

export function clearQrContext(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* swallow */
  }
}
