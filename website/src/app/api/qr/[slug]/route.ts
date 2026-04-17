import { NextResponse, type NextRequest } from "next/server";
import { slugify } from "@/lib/slugify";

/**
 * QR scan tracking redirect.
 * QR codes point here instead of directly to /browse/ pages.
 * Logs a qr_scan event then 302 redirects to the artist profile.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const work = request.nextUrl.searchParams.get("work");
  const venue = request.nextUrl.searchParams.get("v");

  // Track the scan (fire-and-forget, dynamic import to avoid crash if env vars missing)
  try {
    const { trackEvent, extractTrackingContext, generateVisitorId } = await import("@/lib/analytics");
    const ctx = extractTrackingContext(request.headers);
    trackEvent({
      event_type: "qr_scan",
      artist_slug: slug,
      work_id: work || undefined,
      venue_name: venue || undefined,
      qr_label_type: work ? "work" : "portfolio",
      source: "qr",
      visitor_id: generateVisitorId(ctx.ip, ctx.userAgent),
      referrer: ctx.referrer || undefined,
    }).catch(() => {});
  } catch { /* analytics not available */ }

  // Build redirect URL with source attribution
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const sourceParams = `?ref=qr${venue ? `&venue=${encodeURIComponent(venue)}` : ""}`;
  const redirectPath = work
    ? `/browse/${slug}/${slugify(work)}${sourceParams}`
    : `/browse/${slug}${sourceParams}`;

  return NextResponse.redirect(new URL(redirectPath, baseUrl), 302);
}
