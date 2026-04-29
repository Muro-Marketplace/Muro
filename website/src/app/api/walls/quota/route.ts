/**
 * GET /api/walls/quota
 *
 * Returns the current user's quota status for the wall visualizer.
 * Powers the editor's quota chip + upgrade UX.
 *
 * Authenticated users get their tier-resolved status. Unauthenticated
 * callers are intentionally allowed (returns guest tier with zeros) so
 * the customer-on-artwork-page entry point can render the chip without
 * forcing a login first.
 *
 * Optional query params:
 *   ?as=venue|artist|customer    Hint for which portal the user is on.
 *                                Disambiguates dual-role users (artist
 *                                + venue) acting on the venue side.
 */

import { NextResponse } from "next/server";
import { isFlagOn } from "@/lib/feature-flags";
import { getQuotaStatus } from "@/lib/visualizer/quota";
import type { WallOwnerType } from "@/lib/visualizer/types";
import { getAuthenticatedUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const ALLOWED_HINTS = new Set<WallOwnerType>(["venue", "artist", "customer"]);

function parseHint(value: string | null): WallOwnerType | undefined {
  if (!value) return undefined;
  return ALLOWED_HINTS.has(value as WallOwnerType) ? (value as WallOwnerType) : undefined;
}

export async function GET(request: Request) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json(
      { error: "Wall visualizer is not enabled" },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const ownerTypeHint = parseHint(url.searchParams.get("as"));

  // Auth is optional here. The shared helper returns a 401 NextResponse
  // in `error` when the bearer token is missing, for the quota route we
  // treat that as "guest" instead of bouncing the call.
  let userId: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const auth = await getAuthenticatedUser(request);
    if (auth.user) userId = auth.user.id;
  }

  const status = await getQuotaStatus({ userId, ownerTypeHint });
  return NextResponse.json(status);
}
