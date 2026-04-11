import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { createHash } from "crypto";

export interface TrackEventParams {
  event_type: string;
  artist_slug?: string;
  work_id?: string;
  venue_user_id?: string;
  venue_name?: string;
  visitor_id?: string;
  referrer?: string;
  source?: string;
  qr_label_type?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert an analytics event. Fire-and-forget -- never await in the response path.
 */
export async function trackEvent(params: TrackEventParams): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    await db.from("analytics_events").insert({
      event_type: params.event_type,
      artist_slug: params.artist_slug || null,
      work_id: params.work_id || null,
      venue_user_id: params.venue_user_id || null,
      venue_name: params.venue_name || null,
      visitor_id: params.visitor_id || null,
      referrer: params.referrer || null,
      source: params.source || null,
      qr_label_type: params.qr_label_type || null,
      metadata: params.metadata || {},
    });
  } catch (err) {
    console.error("[analytics] Failed to track event:", err);
  }
}

/**
 * Generate a daily-rotating privacy-safe visitor ID.
 * No cookies, no persistent tracking. GDPR-friendly.
 */
export function generateVisitorId(ip: string, userAgent: string): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const hash = createHash("sha256")
    .update(`${ip}:${userAgent}:${date}`)
    .digest("hex");
  return hash.slice(0, 16);
}

/**
 * Extract tracking context from request headers.
 */
export function extractTrackingContext(headers: Headers): {
  ip: string;
  userAgent: string;
  referrer: string | null;
} {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const userAgent = headers.get("user-agent") || "unknown";
  const referrer = headers.get("referer") || null;
  return { ip, userAgent, referrer };
}
