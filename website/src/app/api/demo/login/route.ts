/**
 * POST /api/demo/login?role=artist|venue
 *
 * Signs in the sandboxed demo account for the requested role on the
 * server and hands the resulting session tokens back to the /demo page,
 * which applies them with `supabase.auth.setSession(...)` on the shared
 * client and then routes into the relevant portal.
 *
 * Activation: requires four env vars
 *   - DEMO_ARTIST_EMAIL + DEMO_ARTIST_PASSWORD
 *   - DEMO_VENUE_EMAIL  + DEMO_VENUE_PASSWORD
 *
 * Without them this route returns 503 with a friendly message so the
 * /demo page can fall back to the public-profile redirect.
 *
 * Auth handshake:
 *   We sign in with email + password against Supabase Auth using the
 *   anon key, then return the session's access/refresh tokens as JSON.
 *   The app's client is plain supabase-js with localStorage sessions
 *   (there is no @supabase/ssr dependency and no middleware), so
 *   httpOnly `sb-*` cookies set here would never be read by anything;
 *   a previous version of this route set exactly those cookies and the
 *   demo visitor bounced straight to /login. The client-side
 *   `setSession` call is the only handshake this app understands.
 *
 *   Exposure note: returning the tokens in the response body is
 *   equivalent exposure to the old cookie design. Either way the
 *   browser ends up holding the shared demo user's own short-lived
 *   session JWT and nothing else; no service-role token leaves the
 *   server.
 *
 * Write protection:
 *   The `assertNotDemo` helper in @/lib/demo-guard is what actually
 *   stops a demo session from breaking shared state. This endpoint
 *   only handles getting the user signed in.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { safeRedirect } from "@/lib/safe-redirect";

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

// E36b. This used to be a hand-rolled `explicit.startsWith("/")`, the only
// redirect construction in the app that did not go through safe-redirect.
// startsWith("/") accepts a protocol-relative URL: `new URL("//evil.example/x",
// "https://wallplace.co.uk/...")` resolves to https://evil.example/x, and
// "/\evil.example" is read as a host by several browsers. The response carries
// the demo session's tokens, and the client navigates wherever `redirectTo`
// says, so an off-site value here is a credential-adjacent bounce starting
// from a wallplace.co.uk URL, exactly the shape a phishing link wants. Use
// the shared helper; do not grow a second one here.
function destinationFor(role: "artist" | "venue", explicit: string | null): string {
  const fallback = role === "venue" ? "/venue-portal" : "/artist-portal";
  return safeRedirect(explicit, fallback);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const roleRaw = url.searchParams.get("role");
  const role: "artist" | "venue" =
    roleRaw === "venue" ? "venue" : "artist";
  const redirectTo = destinationFor(role, url.searchParams.get("next"));

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

  // Hand the session to the client. The /demo page feeds these straight
  // into `supabase.auth.setSession(...)` on the shared localStorage
  // client, then navigates to `redirectTo`. Deliberately no Set-Cookie:
  // nothing in this app reads auth cookies, so setting one would only
  // fake a sign-in that never happens.
  return NextResponse.json({
    configured: true,
    role,
    redirectTo,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
