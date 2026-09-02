import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp, UNKNOWN_IP } from "@/lib/client-ip";
import { termsAcceptSchema } from "@/lib/validations";

// E46b (06 B1). This route records acceptance of the platform terms, so its rows
// are the evidence trail for a contractual act.
//
// It used to insert `user_email` straight from the request body while discarding
// the auth error, so an unauthenticated caller could forge a row asserting that
// any email address had accepted, stamped with the attacker's IP. Two harms: a
// forged acceptance against a third party, and repudiation cover for a real one
// ("that row could have been anyone").
//
// Two of the three problems are closed here:
//
//   1. An AUTHENTICATED acceptance now takes the email from the token and
//      ignores the body's. The body can no longer name a third party.
//   2. The body is schema-validated and the route is rate limited. It was four
//      uncapped free-text fields on an unbounded unauthenticated insert.
//
// The third is NOT closed, and cannot be closed here: see the block above the
// unauthenticated branch below. It needs an owner decision, recorded in
// PROGRESS.md.
export async function POST(request: Request) {
  try {
    // Unbounded unauthenticated insert, so the limit is the first gate.
    const limited = await checkRateLimit(request, 10, 60_000);
    if (limited) return limited;

    const parsed = termsAcceptSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { user } = await getAuthenticatedUser(request);

    // Server-derived when we have a token. The body's userEmail is only used on
    // the pre-signup path, where there is no token to derive anything from.
    //
    // ── The residual gap, stated plainly ────────────────────────────────────
    // All six callers (three signup pages, ApplicationForm x2) fire immediately
    // after supabase.auth.signUp and BEFORE email confirmation, so there is no
    // session yet. Requiring auth would break every one of them.
    //
    // 06 §3.2 suggests splitting the route and binding pre-signup acceptance to
    // "a short-lived signed token issued by the signup flow". That cannot work:
    // any endpoint that issues such a token pre-auth is itself unauthenticated,
    // so an attacker mints one for a victim's address and is exactly where they
    // started. A pre-auth assertion about an email address is forgeable by
    // construction.
    //
    // The sound fix is to record acceptance AFTER confirmation, from the token,
    // carrying the version through signUp's options.data. That changes when the
    // evidence is stamped, which is a legal-trail decision, not a code one.
    const isAuthenticated = !!user?.email;
    const userEmail = isAuthenticated
      ? (user!.email as string).toLowerCase()
      : parsed.data.userEmail;

    // E36c: this is the audit IP on a legal acceptance record. It used to be
    // the left-most x-forwarded-for entry, which the caller supplies, so the
    // one field meant to make the row hard to repudiate was the easiest to
    // forge. Null when no platform header identified the caller, rather than
    // recording "unknown" as though it were an address.
    const clientIp = getClientIp(request);
    const ip = clientIp === UNKNOWN_IP ? null : clientIp;
    const userAgent = request.headers.get("user-agent") || null;

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("terms_acceptances").insert({
      user_id: user?.id || null,
      user_email: userEmail,
      user_type: parsed.data.userType,
      terms_version: parsed.data.termsVersion,
      terms_type: parsed.data.termsType,
      ip_address: ip,
      user_agent: userAgent,
      accepted_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Terms acceptance insert error:", error);
      return NextResponse.json(
        { error: "Failed to record terms acceptance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[terms/accept] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
