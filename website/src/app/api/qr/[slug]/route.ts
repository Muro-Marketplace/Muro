import { NextResponse, type NextRequest } from "next/server";
import { slugify } from "@/lib/slugify";

/**
 * QR scan tracking redirect.
 *
 * QR codes point here instead of directly to /browse/ pages so the
 * scan can be logged to `analytics_events` before the visitor lands
 * on the artist's page.
 *
 * Supported query params (newer + older formats coexist):
 *   - `w`     → work id (preferred)              ← sets analytics_events.work_id
 *   - `t`     → work title (newer compat)         ← human-readable redirect target
 *   - `work`  → work title (legacy)               ← same as `t`
 *   - `vs`    → venue slug (preferred)            ← resolved to venue_user_id
 *   - `v`     → venue display name (legacy)       ← analytics_events.venue_name
 *   - `size`  → preselected size on landing
 *
 * Older QR labels printed before this rework still resolve correctly
 * because we keep the `work=` / `v=` fallbacks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  // Pull both new + legacy keys.
  const workId = request.nextUrl.searchParams.get("w");
  const workTitleNew = request.nextUrl.searchParams.get("t");
  const workTitleLegacy = request.nextUrl.searchParams.get("work");
  const workTitle = workTitleNew || workTitleLegacy;
  const venueSlug = request.nextUrl.searchParams.get("vs");
  const venueNameRaw = request.nextUrl.searchParams.get("v");
  const size = request.nextUrl.searchParams.get("size");

  // Best-effort venue user_id resolution + analytics insert.
  // Fire-and-forget, the redirect should never block on telemetry.
  try {
    const [{ trackEvent, extractTrackingContext, generateVisitorId }, { getSupabaseAdmin }] = await Promise.all([
      import("@/lib/analytics"),
      import("@/lib/supabase-admin"),
    ]);
    const ctx = extractTrackingContext(request.headers);

    let venueUserId: string | undefined;
    let venueName = venueNameRaw || undefined;
    if (venueSlug) {
      try {
        const db = getSupabaseAdmin();
        const { data: vp } = await db
          .from("venue_profiles")
          .select("user_id, name")
          .eq("slug", venueSlug)
          .maybeSingle<{ user_id: string | null; name: string | null }>();
        if (vp?.user_id) venueUserId = vp.user_id;
        // Prefer the name on the actual profile so an artist editing
        // their venue's display name doesn't have to reprint labels.
        if (vp?.name) venueName = vp.name;
      } catch {
        /* ignore, fall through to whatever was on the URL */
      }
    }

    trackEvent({
      event_type: "qr_scan",
      artist_slug: slug,
      // Pass the real work id when we have it. Falls back to the
      // legacy title-as-id behaviour only if no `w=` was sent, keeps
      // very-old printed QRs working without tagging them as broken.
      work_id: workId || undefined,
      venue_user_id: venueUserId,
      venue_name: venueName,
      qr_label_type: workId || workTitle ? "work" : "portfolio",
      source: "qr",
      visitor_id: generateVisitorId(ctx.ip, ctx.userAgent),
      referrer: ctx.referrer || undefined,
    }).catch((err) => {
      console.warn("[qr] trackEvent failed:", err);
    });
  } catch (err) {
    console.warn("[qr] analytics not available:", err);
  }

  // Build redirect URL. Always carries `?ref=qr` for downstream
  // social-proof attribution + the venue display name so the artwork
  // page can show "Seen in [venue name]".
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const redirectParams = new URLSearchParams({ ref: "qr" });
  if (venueNameRaw) redirectParams.set("venue", venueNameRaw);
  if (workTitle) redirectParams.set("work", slugify(workTitle));
  if (size) redirectParams.set("size", size);
  const qs = redirectParams.toString();
  const redirectPath = `/browse/${slug}${qs ? `?${qs}` : ""}`;

  return NextResponse.redirect(new URL(redirectPath, baseUrl), 302);
}
