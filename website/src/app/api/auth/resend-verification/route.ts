import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { safeRedirect } from "@/lib/safe-redirect";

/**
 * POST /api/auth/resend-verification (09 §A.5, item 3.2)
 *
 * There was no resend path anywhere: `.resend(` had zero hits in src/. A user
 * who lost their verification email had no recovery at all — they could not log
 * in, could not sign up again (the address is taken), and had nothing to click.
 * That silently kills signups, and silently is the worst part: nothing about it
 * shows up as an error anywhere.
 *
 * Enumeration-safe by construction, on the lesson E36d just cost: the response
 * is byte-identical whether the address has an unconfirmed account, a confirmed
 * one, or none at all. Supabase distinguishes all three; this endpoint does not.
 * The 200 promises only "if that address needs a link, one is on its way".
 *
 * The anon client is correct here. `auth.resend` is a public GoTrue endpoint and
 * needs no elevated key; using the service role would gain nothing and put a
 * privileged credential on an unauthenticated path.
 */

const schema = z.object({
  email: z.string().email().max(320),
  /** Where the link should land. Validated, never trusted. */
  next: z.string().max(500).optional(),
});

/**
 * Read at call time, not at module load. A module-level capture bakes in
 * whatever the environment was when the bundle first evaluated, which is both a
 * deployment footgun and untestable.
 */
function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
}

/** The one response. Do not branch this on anything about the account. */
const ACKNOWLEDGEMENT = {
  ok: true,
  message: "If that address needs confirming, we've sent a new link. Check your inbox and spam folder.",
} as const;

export async function POST(request: Request) {
  // Tighter than the 5/min the other auth forms use: this one sends mail to an
  // address the caller names, so an unlimited version is a mail-bombing tool
  // pointed at whoever the attacker likes.
  const limited = await checkRateLimit(request, 3, 300_000);
  if (limited) return limited;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* fall through; the schema rejects it */
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  }

  // The redirect is built server-side from our own origin. `next` only
  // contributes a path, through the same validator every other redirect uses,
  // so this cannot become an open redirect in a confirmation email.
  const nextPath = safeRedirect(parsed.data.next, "/browse");
  const emailRedirectTo = `${siteOrigin()}/login?next=${encodeURIComponent(nextPath)}`;

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo },
  });

  if (error) {
    // Deliberately swallowed. Supabase says different things for "no such user"
    // and "already confirmed", and passing either back is the account-existence
    // oracle E36d closed on the other three public forms. Logged so an operator
    // can still see a genuine provider outage.
    console.warn("[resend-verification] suppressed:", error.message);
  }

  return NextResponse.json(ACKNOWLEDGEMENT);
}
