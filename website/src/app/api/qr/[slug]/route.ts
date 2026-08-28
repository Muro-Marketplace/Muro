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

  // Resolved venue context, declared at the outer scope so the redirect
  // builder below can read the canonical name (from venue_profiles) and
  // not just whatever was baked into the printed QR.
  let venueName: string | undefined = venueNameRaw || undefined;

  // Best-effort venue user_id resolution + analytics insert.
  // Fire-and-forget, the redirect should never block on telemetry.
  try {
    const [{ trackEvent, extractTrackingContext, generateVisitorId }, { getSupabaseAdmin }] = await Promise.all([
      import("@/lib/analytics"),
      import("@/lib/supabase-admin"),
    ]);
    const ctx = extractTrackingContext(request.headers);

    let venueUserId: string | undefined;
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
  // social-proof attribution. `venue` carries the SLUG (drives the
  // placement lookup at checkout); `venueName` carries the display
  // string for the "Seen in" banner. Pre-2026-05 the redirect put the
  // display name in `venue`, which broke the slug-based placement
  // lookup in the Stripe webhook and silently zeroed every venue
  // revenue-share payout.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const redirectParams = new URLSearchParams({ ref: "qr" });
  if (venueSlug) redirectParams.set("venue", venueSlug);
  // D10: mint a signed claim binding this venue to the scanned artist (`slug`),
  // so checkout can verify the attribution instead of trusting the raw `venue`
  // slug the client could otherwise forge. Best-effort: a missing secret must not
  // break the redirect, it just falls back to the bare slug (still accepted until
  // QR_ATTRIBUTION_ENFORCE is turned on).
  if (venueSlug) {
    try {
      const { signQrAttribution } = await import("@/lib/qr-attribution-token");
      redirectParams.set("va", await signQrAttribution({ venueSlug, artistSlug: slug }));
    } catch (err) {
      console.warn("[qr] could not sign venue attribution", { err: String(err) });
    }
  }
  // Display name resolved from venue_profiles above (line 58) takes
  // precedence over the raw `v=` value baked into the printed label,
  // so a venue that renamed itself doesn't have to reprint.
  if (venueName) redirectParams.set("venueName", venueName);
  if (workTitle) redirectParams.set("work", slugify(workTitle));
  if (size) redirectParams.set("size", size);
  const qs = redirectParams.toString();
  const redirectPath = `/browse/${slug}${qs ? `?${qs}` : ""}`;

  return NextResponse.redirect(new URL(redirectPath, baseUrl), 302);
}
