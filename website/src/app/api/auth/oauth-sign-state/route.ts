// POST /api/auth/oauth-sign-state
//
// Mints a signed state token the OAuth flow round-trips back to
// /auth/callback. Keeps the OAUTH_STATE_SECRET server-side and is the
// only entry point for state creation.

import { NextResponse } from "next/server";
import { signOAuthState } from "@/lib/oauth-state";
import { isSignupRole } from "@/lib/auth-roles";
import { safeRedirect } from "@/lib/safe-redirect";

export async function POST(request: Request) {
  let body: { role?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // E35d: was `isRole`, which accepts "admin". This route is unauthenticated,
  // so POST {"role":"admin"} minted a validly HMAC-signed state token claiming
  // admin, and that token is what the whole OAuth flow trusts downstream.
  // A role someone ASKS for is never admin; admin is granted server-side only.
  if (!isSignupRole(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const next = safeRedirect(body.next, "/browse");
  const state = await signOAuthState({ role: body.role, next }).catch(() => null);
  if (!state) {
    return NextResponse.json({ error: "OAuth not configured" }, { status: 503 });
  }
  return NextResponse.json({ state });
}
