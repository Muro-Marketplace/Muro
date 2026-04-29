/**
 * /api/demo/login?role=artist|venue
 *
 * Funnels homepage / `/demo` visitors into the read-only sandboxed
 * demo account for the requested role and redirects them into the
 * relevant portal landing page.
 *
 * Activation: requires four env vars
 *   - DEMO_ARTIST_USER_ID + DEMO_ARTIST_PASSWORD
 *   - DEMO_VENUE_USER_ID  + DEMO_VENUE_PASSWORD
 *
 * Without them this route returns 503 with a friendly message so the
 * /demo page can fall back to the public-profile redirect.
 *
 * Auth handshake:
 *   We sign in with email + password against Supabase Auth, then set
 *   the resulting access/refresh tokens as `sb-*` cookies the client
 *   already reads via @supabase/ssr. No service-role token leaves the
 *   server, the only thing that crosses to the browser is the
 *   demo user's own short-lived session JWT.
 *
 * Write protection:
 *   The `assertNotDemo` helper in @/lib/demo-guard is what actually
 *   stops a demo session from breaking shared state. This endpoint
 *   only handles getting the user signed in.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

interface DemoCreds {
  email: string;
  password: string;
}

function readCreds(role: "artist" | "venue"): DemoCreds | null {
  if (role === "artist") {
    const email = process.env.DEMO_ARTIST_EMAIL;
    const password = process.env.DEMO_ARTIST_PASSWORD;
    if (!email || !password) return null;
    return { email, password };
  }
  const email = process.env.DEMO_VENUE_EMAIL;
  const password = process.env.DEMO_VENUE_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

function destinationFor(role: "artist" | "venue", explicit: string | null): string {
  if (explicit && explicit.startsWith("/")) return explicit;
  return role === "venue" ? "/venue-portal" : "/artist-portal";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleRaw = url.searchParams.get("role");
  const role: "artist" | "venue" =
    roleRaw === "venue" ? "venue" : "artist";
  const next = destinationFor(role, url.searchParams.get("next"));

  const creds = readCreds(role);
  if (!creds) {
    // Demo account not configured yet, return a JSON 503 the /demo
    // page can soft-handle (fall back to /browse/<demo slug>).
    return NextResponse.json(
      {
        error: "Demo account not configured",
        configured: false,
        role,
      },
      { status: 503 },
    );
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 500 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error || !data.session) {
    console.error("[demo/login] sign-in failed:", error?.message);
    return NextResponse.json(
      {
        error:
          "Could not start demo session. The demo account may be misconfigured.",
        configured: true,
        role,
      },
      { status: 500 },
    );
  }

  // Redirect into the portal with the session's auth-bearing cookies
  // attached. Supabase's @supabase/ssr middleware (already configured
  // app-wide) reads these and rehydrates the session on the next
  // request.
  const res = NextResponse.redirect(new URL(next, request.url), {
    status: 303, // see-other so the GET → GET handoff is correct
  });

  // Set the same access / refresh cookies the regular auth flow uses.
  // Names match @supabase/ssr's defaults; if your project overrides
  // them, mirror that override here.
  const projectRef = SUPABASE_URL.replace(/^https?:\/\//, "").split(".")[0];
  const cookieBase = `sb-${projectRef}-auth-token`;
  const cookieValue = JSON.stringify([
    data.session.access_token,
    data.session.refresh_token,
    null,
    null,
    null,
  ]);
  res.cookies.set(cookieBase, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: data.session.expires_in,
  });

  return res;
}
