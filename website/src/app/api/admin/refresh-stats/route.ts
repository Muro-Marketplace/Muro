import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { refreshArtistStatsCaches } from "@/lib/stats-cache";

/**
 * POST /api/admin/refresh-stats
 * Admin-only, recomputes all cached artist stats from analytics, placements, and enquiries.
 */
// E30a / G4. Not destructive, but it rewrites public-facing numbers for every
// artist on demand, and left no trail.
//
// Converted to withAdmin, which also collapses the hand-rolled
// getAuthenticatedUser + isAdminRequest pair. 401 for a missing token and 403
// for a non-admin are unchanged. The one difference: an unconfigured
// ADMIN_EMAILS now answers 503 like every other getAdminUser route, instead of
// a 403 that blamed the caller for a deployment fault.
export async function POST(request: Request) {
  return withAdmin(request, "artist_stats_refreshed", async ({ audit }) => {
    const result = await refreshArtistStatsCaches();

    audit({ updated: result.updated, errorCount: result.errors.length });

    return NextResponse.json({
      success: true,
      updated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  });
}
