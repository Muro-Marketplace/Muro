// Phase 2.5 helper endpoint. Returns the caller's subscription state
// so the client can render paywall cards / upgrade prompts without a
// 402 round-trip. Mirrors the resolveSubscription() shape from
// src/lib/subscriptions.ts.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { resolveSubscription } from "@/lib/subscriptions";
import { isFlagOn } from "@/lib/feature-flags";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const state = await resolveSubscription(auth.user!.id);
  return NextResponse.json({
    active: state.active,
    plan: state.plan,
    userType: state.user_type,
    gatingEnabled: isFlagOn("GATING_V1"),
  });
}
