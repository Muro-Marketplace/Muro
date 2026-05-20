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
// The confirmation string is a soft seatbelt against XSS / replay — a
// CSRF-style fluke can't accidentally delete an account because the body
// has to literally read "DELETE MY ACCOUNT".
//
// Security: userId comes from auth.user.id (the verified bearer token),
// NEVER from anything in the request body. A caller who smuggles
// `{ user_id: "..." }` cannot delete someone else's account.
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
// email_suppressions, email_events rows with user_id IS NULL) are
// NOT erased here. They persist by-design until a follow-up plan
// adds an email-keyed deletion pass. The auth user's email itself
// IS erased by auth.admin.deleteUser, but copies in the email
// pipeline tables persist.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const CONFIRM_STRING = "DELETE MY ACCOUNT";

// Tables to wipe rows from, keyed by the user_id (or equivalent) column.
// Order matters: child tables before parents so foreign-key cascades
// don't fight us. artist_profiles / venue_profiles / customer_profiles
// come last because other rows (artist_works, etc.) FK to them.
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
  { table: "placements", col: "requester_user_id" },
  { table: "placements", col: "artist_user_id" },
  { table: "placements", col: "venue_user_id" },

  // Commerce
  { table: "orders", col: "buyer_user_id" },
  { table: "orders", col: "artist_user_id" },
  { table: "refund_requests", col: "requester_user_id" },
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

  // Best-effort row deletes. Errors are logged but don't abort —
  // the auth.users delete at the end is what matters legally.
  // delete().eq() returning no matching rows is a success path
  // (`error: null, count: 0`), only log when error is truthy.
  for (const { table, col } of TABLES_USER_ID) {
    const { error } = await db.from(table).delete().eq(col, userId);
    if (error) console.error(`[account/delete] ${table}.${col} cleanup failed:`, error.message);
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
