// /api/account/delete — POST GDPR right-to-erasure (hard delete).
//
// Hard-deletes the authenticated user's auth row + every profile / artefact
// owned by them. Idempotent at row level (DELETE WHERE matches nothing
// returns success).
//
// This sits alongside DELETE /api/account, which is a soft-delete /
// anonymisation flow. The two endpoints intentionally serve different
// purposes:
//   - DELETE /api/account     anonymises rows but preserves order history
//                             for tax/compliance reasons (confirm: "DELETE")
//   - POST   /api/account/delete   hard-erases everything we own
//                                  (confirm: "DELETE MY ACCOUNT")
//
// One policy is shared with the sibling, not different (C14a): orders and
// refund_requests are financial records with a lawful retention basis, so
// even the hard path RETAINS those rows and anonymises the personal
// identifiers in them (buyer_email, the name/address inside the shipping
// json, requester_email) instead of deleting them. This route used to
// hard-delete both, contradicting the retention policy the sibling
// documents.
//
// The confirmation string is a soft seatbelt against XSS / replay — a
// CSRF-style fluke can't accidentally delete an account because the body
// has to literally read "DELETE MY ACCOUNT".
//
// Security: userId comes from auth.user.id (the verified bearer token),
// NEVER from anything in the request body. A caller who smuggles
// `{ user_id: "..." }` cannot delete someone else's account. The
// email-keyed passes below match only the account's own verified email
// (auth.user.email), so they can never scrub another person's rows.
//
// Migration audit (2026-05-02): tables in TABLES_USER_ID below were verified
// against supabase/migrations/*.sql. Tables that were in the original plan
// but do not exist (e.g. messages.recipient_id — the actual column is
// recipient_user_id) have been corrected. Tables added after the plan was
// drafted (visualizer suite from 035, purchase_offers from 045, artwork
// requests/responses/commissions from 046, feature_requests from 044,
// placement_records/photos/archives/reviews, terms/email/curation rows)
// are now included.
//
// Known gap: email-keyed PII tables (newsletter_subscribers,
// email_suppressions, email_events rows with user_id IS NULL, and
// purchase_offers rows keyed only by buyer_email) are NOT erased here.
// They persist by-design until a follow-up plan adds a full email-keyed
// deletion pass. The auth user's email itself IS erased by
// auth.admin.deleteUser, but copies in the email pipeline tables persist.
// Orders and refund_requests keyed by email ARE covered: see the
// anonymisation passes below.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const CONFIRM_STRING = "DELETE MY ACCOUNT";

// Tables to wipe rows from, keyed by the user_id (or equivalent) column.
// Order matters: child tables before parents so foreign-key cascades
// don't fight us. artist_profiles / venue_profiles / customer_profiles
// come last because other rows (artist_works, etc.) FK to them.
//
// orders and refund_requests are deliberately NOT in this list: they are
// retained and anonymised instead (C14a), see the passes after the loop.
const TABLES_USER_ID: Array<{ table: string; col: string }> = [
  // Per-user UI artefacts
  { table: "saved_items", col: "user_id" },
  { table: "notifications", col: "user_id" },
  { table: "feature_request_upvotes", col: "user_id" },
  { table: "feature_requests", col: "user_id" },
  { table: "artist_referrals", col: "referrer_user_id" },
  { table: "artist_referrals", col: "referred_user_id" },

  // Messaging
  { table: "messages", col: "sender_id" },
  { table: "messages", col: "recipient_user_id" },

  // Placements & related lifecycle records
  { table: "placement_archives", col: "user_id" },
  { table: "placement_photos", col: "uploader_user_id" },
  { table: "placement_records", col: "artist_user_id" },
  { table: "placement_records", col: "venue_user_id" },
  { table: "placement_reviews", col: "reviewer_user_id" },
  { table: "placement_reviews", col: "reviewee_user_id" },
  // No requester_user_id entry: that column is the N3 phantom (it exists in
  // migration 008 in-repo but NOT in the live schema, see PROGRESS 7c), so
  // the delete filtering on it was rejected whole by PostgREST on every run
  // and silently swallowed. The two entries below already cover every
  // placement row that references the user, because the requester is always
  // one of the two parties on the row.
  { table: "placements", col: "artist_user_id" },
  { table: "placements", col: "venue_user_id" },

  // Commerce (minus the retained financial records, see above)
  { table: "purchase_offers", col: "buyer_user_id" },
  { table: "purchase_offers", col: "artist_user_id" },
  { table: "artwork_request_responses", col: "artist_user_id" },
  { table: "artwork_requests", col: "venue_user_id" },
  { table: "commissions", col: "artist_user_id" },
  { table: "commissions", col: "buyer_user_id" },
  { table: "curation_requests", col: "requester_user_id" },

  // Visualizer suite (035_visualizer_core)
  { table: "wall_renders", col: "user_id" },
  { table: "wall_layouts", col: "user_id" },
  { table: "walls", col: "user_id" },
  { table: "visualizer_usage", col: "user_id" },
  { table: "visualizer_quota_overrides", col: "user_id" },

  // Email + terms
  { table: "email_events", col: "user_id" },
  { table: "email_preferences", col: "user_id" },
  { table: "terms_acceptances", col: "user_id" },

  // Profiles last
  { table: "artist_profiles", col: "user_id" },
  { table: "venue_profiles", col: "user_id" },
  { table: "customer_profiles", col: "user_id" },
];

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // C15: the soft demo guard every sibling mutation has. The public demo
  // funnel signs any visitor into a shared demo account; without this,
  // "Try the demo" handed out the power to hard-delete it. 200 + {demo:true}
  // so the portal can toast without unwinding optimistic state.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  // request.json() returns null (not an exception) when the body is
  // literal JSON `null`, so we must defensively guard against `body`
  // being null/undefined before reading `body.confirm`.
  let body: { confirm?: string } | null = {};
  try {
    body = await request.json();
  } catch {
    /* fall through — body stays {} and the confirm check below will fail */
  }

  if (!body || body.confirm !== CONFIRM_STRING) {
    return NextResponse.json(
      { error: `To confirm, the body must contain { "confirm": "${CONFIRM_STRING}" }.` },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const userId = auth.user!.id; // ← from verified bearer token, never from body
  const email = auth.user!.email || "";
  const anonTag = `[deleted-${userId.slice(0, 8)}]`;

  // C14c: every step is checked, and failures COLLECT rather than
  // short-circuit — same idiom as the sibling DELETE /api/account. A scrub
  // that stops at the first error leaves MORE data behind than one that
  // carries on and reports, and deleting the auth user anyway is what makes
  // failures invisible: the account is gone, so nobody can log in and
  // notice their data survived.
  const failures: string[] = [];

  // WS3.2 (missing-events gap 2, CRITICAL): deletion must stop the money.
  // Before this, a deleted person's Stripe subscriptions kept billing forever:
  // their SaaS plan, any paid-loan placements they were paying for as a
  // venue, and any managed curation retainer. Cancellation failures collect
  // like every other step, and a failure ABORTS the deletion below, because
  // "account gone, card still charged monthly" is the one outcome worse than
  // asking the user to try again.
  const cancelStripeSub = async (label: string, subId: string | null | undefined) => {
    if (!subId) return;
    try {
      const { stripe } = await import("@/lib/stripe");
      await stripe.subscriptions.cancel(subId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Already-cancelled or missing is the state we wanted.
      if (/canceled subscription/i.test(msg) || /No such subscription/i.test(msg)) return;
      failures.push(`${label}: ${msg}`);
    }
  };
  {
    const { data: artistRow } = await db
      .from("artist_profiles")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle<{ stripe_subscription_id: string | null }>();
    await cancelStripeSub("stripe (artist plan)", artistRow?.stripe_subscription_id);

    const { data: paidLoans } = await db
      .from("placement_recurring_billings")
      .select("stripe_subscription_id, status")
      .eq("payer_user_id", userId)
      .in("status", ["active", "past_due", "paused"]);
    for (const row of (paidLoans || []) as Array<{ stripe_subscription_id: string | null; status: string }>) {
      await cancelStripeSub("stripe (paid loan)", row.stripe_subscription_id);
    }

    const { data: curations } = await db
      .from("curation_requests")
      .select("stripe_subscription_id, status")
      .eq("requester_user_id", userId)
      .in("status", ["in_progress", "past_due", "paused"]);
    for (const row of (curations || []) as Array<{ stripe_subscription_id: string | null; status: string }>) {
      await cancelStripeSub("stripe (curation)", row.stripe_subscription_id);
    }
  }
  const step = async (label: string, run: () => PromiseLike<{ error: unknown } | void>) => {
    try {
      const result = await run();
      const err = result && typeof result === "object" && "error" in result ? result.error : null;
      if (err) {
        failures.push(`${label}: ${(err as { message?: string }).message ?? String(err)}`);
      }
    } catch (err) {
      failures.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 1. Hard-delete the rows we own outright. delete().eq() matching no rows
  //    is a success path (`error: null, count: 0`).
  for (const { table, col } of TABLES_USER_ID) {
    await step(`${table}.${col}`, () => db.from(table).delete().eq(col, userId));
  }

  // 2. Retained financial records (C14a): keep the rows, strip the person.
  //    shipping holds the buyer's name and address; buyer_email /
  //    requester_email are the other PII columns. Mirrors step 4 of the
  //    sibling soft-delete.
  await step("orders (anonymise by user id)", () =>
    db.from("orders").update({ buyer_email: anonTag, shipping: {} }).eq("buyer_user_id", userId),
  );
  await step("refund_requests (anonymise by user id)", () =>
    db.from("refund_requests").update({ requester_email: anonTag }).eq("requester_user_id", userId),
  );

  // 3. Guest rows (C14b): orders placed while logged out carry no
  //    buyer_user_id, only the email typed at checkout, so the pass above
  //    never sees them. Match strictly by the account's own verified email
  //    so this can never touch another person's order.
  if (email) {
    await step("orders (anonymise by email)", () =>
      db.from("orders").update({ buyer_email: anonTag, shipping: {} }).eq("buyer_email", email),
    );
    await step("refund_requests (anonymise by email)", () =>
      db.from("refund_requests").update({ requester_email: anonTag }).eq("requester_email", email),
    );
  }

  // Refuse to delete the auth user while personal data is still standing
  // (C14c). Same contract as the sibling: nothing gets half-removed, and
  // the person keeps an account they can log into while support finishes
  // the job by hand.
  if (failures.length > 0) {
    console.error("[account/delete] erasure incomplete, auth user RETAINED", { userId, failures });
    return NextResponse.json(
      {
        error:
          "We could not fully delete your data, so we have not closed the account. " +
          "Nothing has been half-removed. Please contact support and we will finish it by hand.",
      },
      { status: 500 },
    );
  }

  const { error: deleteErr } = await db.auth.admin.deleteUser(userId);
  if (deleteErr) {
    console.error("[account/delete] auth.deleteUser failed:", deleteErr);
    return NextResponse.json(
      { error: "Could not complete account deletion. Contact support." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
