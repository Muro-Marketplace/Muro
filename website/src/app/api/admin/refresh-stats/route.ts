import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { refreshArtistStatsCaches } from "@/lib/stats-cache";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean);

/**
 * POST /api/admin/refresh-stats
 * Admin-only, recomputes all cached artist stats from analytics, placements, and enquiries.
 */
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  // Check admin
  const userEmail = auth.user!.email;
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const result = await refreshArtistStatsCaches();

  return NextResponse.json({
    success: true,
    updated: result.updated,
    errors: result.errors.length > 0 ? result.errors : undefined,
  });
}
