// One-click unsubscribe endpoint backing the List-Unsubscribe-Post header
// + the unsubscribe link in every preferences-bearing email. RFC 8058
// requires the POST variant to work without confirmation, the page-side
// GET wrapper just renders a friendly "you've been unsubscribed" screen.
//
// Auth model: anonymous, but only mutates the row matching the userId in
// the URL. The link itself acts as the bearer, so we accept it even
// without a session. Anyone who has the URL has read the inbox it was
// delivered to, which is the same trust boundary Gmail's one-click flow
// uses. We never reveal whether the userId / category combination
// existed; success message is identical either way.
//
// C27. Being anonymous, the endpoint used to hand whatever arrived in `u`
// straight to an upsert. email_preferences.user_id is a bare
// `uuid PRIMARY KEY` in migration 016 with no REFERENCES auth.users, so
// every call minted a permanent orphan row for any UUID a stranger felt
// like typing, and nothing rate limited the endpoint, so the row count was
// unbounded. Three guards now stand in front of the write:
//
//   1. `u` must parse as a UUID at all (cheap, no I/O).
//   2. the account must actually exist (an application-level FK check,
//      because adding the real constraint needs a migration).
//   3. both verbs are rate limited by IP.
//
// The response is byte-identical whether or not the account exists, so
// this stays useless as an account-existence oracle.

import { NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { preferenceKeyFor, type EmailCategory } from "@/lib/email/categories";
import { unsubscribeSigningConfigured, verifyUnsubscribe } from "@/lib/unsubscribe-token";

export const runtime = "nodejs";

// Deliberately generous. The hard stop on junk rows is the existence check
// below, which is absolute; this limit only bounds the cost of someone
// spraying UUIDs at the lookup. Unsubscribing is a legal obligation and some
// providers proxy the RFC 8058 one-click POST from shared egress addresses,
// so a tight per-IP cap risks throttling real people who share an IP with
// nothing to do with each other.
const RATE_LIMIT = { name: "email_unsubscribe", limit: 60, windowSeconds: 3600 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_CATEGORIES: EmailCategory[] = [
  "security",
  "legal",
  "orders_and_payouts",
  "placements",
  "messages",
  "digests",
  "recommendations",
  "tips",
  "newsletter",
  "promotions",
];

/**
 * Application-level stand-in for the missing FK. Returns true only when the
 * id belongs to a live auth user. Any error (admin API unavailable, network
 * blip) reads as false, i.e. fail closed and write nothing: a dropped
 * unsubscribe is recoverable from the preferences page, an unbounded pile of
 * orphan rows is not.
 */
async function userExists(userId: string): Promise<boolean> {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error) return false;
    return Boolean(data?.user);
  } catch {
    return false;
  }
}

async function applyUnsubscribe(userId: string | null, category: string | null): Promise<{ ok: boolean; message: string }> {
  if (!userId || !category) {
    return { ok: false, message: "Missing unsubscribe parameters" };
  }
  if (!VALID_CATEGORIES.includes(category as EmailCategory)) {
    return { ok: false, message: "Unknown email category" };
  }
  const key = preferenceKeyFor(category as EmailCategory);
  if (!key) {
    // Critical category (security/legal/orders) cannot be unsubscribed from;
    // we still 200 so the unsub link doesn't error in the user's client.
    return { ok: true, message: "This category is required for service and can't be turned off." };
  }
  if (!UUID_RE.test(userId)) {
    return { ok: false, message: "Missing unsubscribe parameters" };
  }
  // C27: the success payload below is returned whether or not the account
  // exists, so a stranger who guesses UUIDs learns nothing and leaves no row
  // behind. Only a real account reaches the write.
  if (await userExists(userId)) {
    const db = getSupabaseAdmin();
    // Ensure a row exists before flipping the toggle; the helper RPC
    // get_email_preferences handles the get-or-create. Use upsert as a
    // belt-and-braces fallback for environments where the function isn't
    // installed (legacy migrations).
    await db.from("email_preferences").upsert({ user_id: userId, [key]: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }
  return { ok: true, message: "You've been unsubscribed from this category." };
}

export async function POST(request: Request) {
  // RFC 8058 one-click. Mail clients send the body url-encoded as
  // List-Unsubscribe=One-Click; we don't need to parse it, the URL
  // params carry the user + category.
  const limited = await withRateLimit(request, RATE_LIMIT);
  if (limited) return limited;
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  const category = url.searchParams.get("c");
  // The POST still honours an unsigned link. RFC 8058 one-click is a
  // deliberate act by the recipient's own mail client, not something a
  // crawler does, and mail sent before signing existed is still in inboxes
  // whose owners are entitled to unsubscribe from it. Once that mail has
  // aged out, this can require a signature too.
  if (!verifyUnsubscribe(userId, url.searchParams.get("s"))) {
    console.warn("[unsubscribe] honoured an unsigned one-click POST (pre-signing email)");
  }
  const result = await applyUnsubscribe(userId, category);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function GET(request: Request) {
  // A signed GET applies the change, for the mail clients that fire a GET at
  // a link rather than opening it.
  //
  // An UNSIGNED GET does not write. The email footer links to the page at
  // /account/email/unsubscribe, which since C24 requires a human to press a
  // button, so link prefetch is already handled there and is not the concern
  // here. What was still true of this endpoint is that the raw user id in the
  // query string was the whole of the authorisation, and a GET is the verb
  // anything can issue. Verified against production on 2026-08-30: an
  // unauthenticated GET carrying nothing but a real user id turned that
  // account's newsletter off. A user id is not a secret, it travels through
  // API responses and logs; a signature is.
  //
  // Unsigned still resolves to a 200 with a message rather than an error: the
  // recipient must be able to unsubscribe, so they are pointed at the
  // preference centre, which is one deliberate click away. Nothing is
  // silently ignored and nothing is silently written.
  const limited = await withRateLimit(request, RATE_LIMIT);
  if (limited) return limited;
  const url = new URL(request.url);
  const userId = url.searchParams.get("u");
  const category = url.searchParams.get("c");
  // Only enforce a signature where we were able to produce one. With
  // ORDER_TOKEN_SECRET unset, every link ever sent is unsigned, so enforcing
  // would turn the unsubscribe link in every email into a dead end. Setting
  // the secret is what activates this protection.
  if (!unsubscribeSigningConfigured()) {
    console.warn(
      "[unsubscribe] ORDER_TOKEN_SECRET is unset, so unsubscribe links cannot be signed and an unsigned GET is honoured. Set it to close this.",
    );
  } else if (!verifyUnsubscribe(userId, url.searchParams.get("s"))) {
    return NextResponse.json(
      {
        ok: true,
        requiresConfirmation: true,
        message:
          "Open your email preferences to confirm which emails you'd like to stop.",
      },
      { status: 200 },
    );
  }
  const result = await applyUnsubscribe(userId, category);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
