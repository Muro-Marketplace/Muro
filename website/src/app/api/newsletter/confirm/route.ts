import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { findUserIdByEmail } from "@/lib/auth/find-user-by-email";

/**
 * GET /api/newsletter/confirm?t=<token> (09 §D.3, item 3.5)
 *
 * The other half of double opt-in. Without it the confirm link 404s and, as
 * §D.3 puts it, double opt-in is worse than none: nobody ever gets confirmed,
 * so nobody ever gets a newsletter, and the form looks like it worked.
 *
 * A GET that mutates, deliberately. It is reached by a person clicking a link
 * in an email, which is a GET; the token in the link is the authorisation, the
 * same bearer model the unsubscribe endpoint already uses. It is safe to repeat
 * only in the sense that the second click is a no-op, because the token is
 * cleared on success.
 *
 * It always REDIRECTS rather than answering JSON. A human is at the other end.
 */

export const runtime = "nodejs";

/** Matches the email copy. A claimed expiry that is not enforced is a lie. */
const EXPIRY_DAYS = 7;

const tokenSchema = z.string().uuid();

interface SubscriberRow {
  id: string;
  email: string;
  subscribed_at: string | null;
  confirmed_at: string | null;
}

function landing(request: Request, status: "ok" | "expired" | "invalid"): NextResponse {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/newsletter/confirmed?status=${status}`, 303);
}

export async function GET(request: Request) {
  // The token is 122 bits, so this is not really about guessing. It is about
  // not letting one client turn a mail-scanner prefetch loop into unbounded
  // database work.
  const limited = await checkRateLimit(request, 20, 60_000);
  if (limited) return limited;

  const raw = new URL(request.url).searchParams.get("t");
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) return landing(request, "invalid");

  const db = getSupabaseAdmin();
  const { data: row, error } = await db
    .from("newsletter_subscribers")
    .select("id, email, subscribed_at, confirmed_at")
    .eq("confirm_token", parsed.data)
    .maybeSingle<SubscriberRow>();

  if (error) {
    console.error("[newsletter/confirm] lookup failed:", error.message);
    return landing(request, "invalid");
  }
  // No row means the token is unknown, or already used and cleared. Both land
  // on the same page: a used token is not a failure worth distinguishing, and
  // distinguishing them would say whether an address is subscribed.
  if (!row) return landing(request, "invalid");

  const issued = row.subscribed_at ? new Date(row.subscribed_at).getTime() : 0;
  if (issued && Date.now() - issued > EXPIRY_DAYS * 86_400_000) {
    return landing(request, "expired");
  }

  const { error: updateError } = await db
    .from("newsletter_subscribers")
    .update({
      confirmed_at: new Date().toISOString(),
      // Cleared, not kept. A forwarded email, a logged URL or a mailbox archive
      // is then a spent link rather than a standing capability.
      confirm_token: null,
      // Confirming is an unambiguous "yes, send me this", so it reverses an
      // earlier unsubscribe on the same address.
      unsubscribed_at: null,
    })
    .eq("id", row.id);

  if (updateError) {
    console.error("[newsletter/confirm] update failed:", updateError.message);
    return landing(request, "invalid");
  }

  // If the address belongs to an account, turn the preference on too. Without
  // this the subscriber is confirmed in one table and opted out in the other,
  // and `sendEmail` would drop every newsletter for them: `newsletter_enabled`
  // defaults to FALSE precisely because double opt-in was meant to set it.
  await enableNewsletterPreference(db, row.email);

  return landing(request, "ok");
}

async function enableNewsletterPreference(
  db: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<void> {
  try {
    // There is no getUserByEmail in the admin API, so this is a paginated,
    // case-insensitive scan. Shared, because the three inline copies that
    // existed before were all unpaginated and all case-sensitive.
    const userId = await findUserIdByEmail(db, email);
    if (!userId) return;

    await db.from("email_preferences").upsert(
      { user_id: userId, newsletter_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  } catch (err) {
    // Best effort. The subscription itself is already confirmed, and failing
    // the whole confirmation over a preference row would show someone an error
    // page for something that did work.
    console.error("[newsletter/confirm] could not enable the preference:", err);
  }
}
