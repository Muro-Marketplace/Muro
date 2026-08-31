// G8. The artists surface was read-only in both directions: the list did not
// select review_status, so an admin could not tell a live profile from one
// still waiting on the gate, and there was no write path, so taking a profile
// off the marketplace meant editing the row in Supabase by hand.
//
// PATCH sets review_status, which is the column the public marketplace filters
// on (anon RLS on artist_profiles exposes 'approved' rows only, and
// /api/browse-artists filters the same way), so it is the real unpublish
// control rather than a cosmetic flag. Every change is audited and, where it
// means something to the artist, emailed.
//
// The three values are the column's own CHECK from migration 023. Anything
// richer, a distinct "suspended" state that reads differently from "rejected
// at the gate", would need a migration.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { recordAdminAction } from "@/lib/admin-audit";
import { assertNotDemoStrict } from "@/lib/demo-guard";
import { sendEmail } from "@/lib/email/send";
import { FOUNDING_ARTIST_LIMIT } from "@/lib/pricing";
import { OperationalAccountRestricted } from "@/emails/templates/legal/OperationalAccountRestricted";
import { OperationalAccountRestored } from "@/emails/templates/legal/OperationalAccountRestored";

export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const { data, error: dbError } = await getSupabaseAdmin()
      .from("artist_profiles")
      .select(
        "id, user_id, slug, name, primary_medium, location, review_status, approved_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    return NextResponse.json({ artists: data || [] });
  } catch (err) {
    console.error("Admin artists error:", err);
    return NextResponse.json({ error: "Failed to fetch artists" }, { status: 500 });
  }
}
// A reason is mandatory on the way down and meaningless on the way up: the
// restriction email prints it, and "your account is restricted, no reason
// given" is not something to put in an artist's inbox.
const patchSchema = z.union([
  // Task 8 / Step 2. `is_founding_artist` sits on ARTIST_PROFILE_SERVER_OWNED
  // (lib/db/writable-fields.ts) precisely so no artist-facing route can set it;
  // this admin toggle is the only write path. The flyer's "First 20 artists:
  // 6 months free" claim is only true while this stays the sole path and the
  // count guard in `setFoundingStatus` holds at FOUNDING_ARTIST_LIMIT.
  z.object({
    id: z.string().uuid(),
    is_founding_artist: z.boolean(),
  }),
  z.object({
    id: z.string().min(1).max(100),
    reviewStatus: z.literal("rejected"),
    reason: z.string().min(2).max(2000),
  }),
  z.object({
    id: z.string().min(1).max(100),
    reviewStatus: z.enum(["approved", "pending"]),
    reason: z.string().max(2000).optional(),
  }),
]);

interface ArtistRow {
  id: string;
  user_id: string | null;
  name: string | null;
  slug: string | null;
  review_status: string | null;
}

export async function PATCH(request: Request) {
  const auth = await getAdminUser(request);
  if (auth.error) return auth.error;
  // The mutation ratchet (01 Phase E item 15) wants every service-role write
  // behind the demo guard. Strict rather than soft: this endpoint hides a
  // profile from the marketplace, so a silent 200 that changed nothing would be
  // the worst answer. Dormant unless a demo user id is also an admin.
  const demo = assertNotDemoStrict(auth.user?.id);
  if (demo) return demo;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  if ("is_founding_artist" in parsed.data) {
    return setFoundingStatus(db, auth.user!.id, parsed.data.id, parsed.data.is_founding_artist);
  }

  const { data: artist } = await db
    .from("artist_profiles")
    .select("id, user_id, name, slug, review_status")
    .eq("id", parsed.data.id)
    .maybeSingle<ArtistRow>();

  if (!artist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const from = artist.review_status ?? "pending";
  const to = parsed.data.reviewStatus;
  if (from === to) {
    // Not merely tidy. Re-applying the same status would send the artist a
    // second identical restriction email off an unrelated click.
    return NextResponse.json({ error: `Already ${to}` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { review_status: to };
  // approved_at is what "live since" reads off, and a profile coming back from
  // rejected has a stale one, or none if it never passed the gate.
  if (to === "approved") updates.approved_at = now;

  const { error: updateError } = await db
    .from("artist_profiles")
    .update(updates)
    .eq("id", artist.id);

  if (updateError) {
    console.error("[admin/artists PATCH]", updateError);
    return NextResponse.json({ error: "Could not update that profile" }, { status: 500 });
  }

  // Ids and the transition only. The reason is free text an admin typed about a
  // named person; it goes to that person in the email and no further. Same call
  // the moderation and curation audits make.
  await recordAdminAction({
    adminUserId: auth.user!.id,
    action: "artist.review_status",
    context: { artist_id: artist.id, slug: artist.slug, from, to },
  });

  await notifyArtist(db, artist, from, to, parsed.data.reason, now);

  return NextResponse.json({ review_status: to });
}

/**
 * Tell the artist, where the transition means something to them.
 *
 * Down to rejected is a restriction. Rejected back up to approved is a
 * restoration. Everything else (a first approval off the pending gate, or a
 * reclassification back to pending) either has its own email elsewhere or is
 * internal bookkeeping, and inventing one here would be worse than silence:
 * "you're back in" to someone who was never out is a lie.
 *
 * Best-effort throughout. sendEmail never throws, and the decision has already
 * been written; a profile must not stay live because a mail server was down.
 */
async function notifyArtist(
  db: ReturnType<typeof getSupabaseAdmin>,
  artist: ArtistRow,
  from: string,
  to: string,
  reason: string | undefined,
  at: string,
): Promise<void> {
  const restricting = to === "rejected";
  const restoring = to === "approved" && from === "rejected";
  if (!restricting && !restoring) return;
  if (!artist.user_id) return;

  let email: string | undefined;
  let firstName = "there";
  try {
    const { data } = await db.auth.admin.getUserById(artist.user_id);
    email = data?.user?.email ?? undefined;
    const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
    const displayName =
      (typeof meta.display_name === "string" && meta.display_name) || artist.name || "";
    if (displayName) firstName = displayName.split(" ")[0];
  } catch (err) {
    console.error("[admin/artists] could not resolve the artist's account:", err);
    return;
  }
  if (!email) return;

  // The timestamp is in the key on purpose: an artist can be restricted, let
  // back in and restricted again, and each of those is a separate event the
  // idempotency check must not swallow as a duplicate of the last one.
  if (restricting) {
    await sendEmail({
      idempotencyKey: `artist_restricted:${artist.id}:${at}`,
      template: "operational_account_restricted",
      category: "legal",
      to: email,
      userId: artist.user_id,
      subject: "Your Wallplace account has been restricted",
      react: OperationalAccountRestricted({
        firstName,
        reason: reason || "A review of your profile.",
        restrictionDetails: [
          "Your profile is hidden from the public marketplace",
          "Existing placements and orders continue as normal",
          "You can still sign in and reply to messages",
        ],
        appealUrl: `${SITE}/support`,
        supportUrl: `${SITE}/support`,
      }),
      metadata: { artistProfileId: artist.id },
    });
    return;
  }

  await sendEmail({
    idempotencyKey: `artist_restored:${artist.id}:${at}`,
    template: "operational_account_restored",
    category: "legal",
    to: email,
    userId: artist.user_id,
    subject: "Your Wallplace account is back to normal",
    react: OperationalAccountRestored({
      firstName,
      restoredAt: new Date(at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      accountUrl: `${SITE}/artist-portal`,
    }),
    metadata: { artistProfileId: artist.id },  });
}

/**
 * Toggle the founding-artist flag, bounded by FOUNDING_ARTIST_LIMIT.
 *
 * The flyer promises "first 20 artists, 6 months free". That is only true while
 * this is the only write path to the column and the count guard below holds, so
 * the 409 is load-bearing marketing copy, not defensive tidiness.
 */
async function setFoundingStatus(
  db: ReturnType<typeof getSupabaseAdmin>,
  adminUserId: string,
  id: string,
  isFounding: boolean,
): Promise<Response> {
  const { data: artist, error: fetchError } = await db
    .from("artist_profiles")
    .select("id, slug, is_founding_artist")
    .eq("id", id)
    .maybeSingle<{ id: string; slug: string | null; is_founding_artist: boolean | null }>();

  if (fetchError) {
    console.error("Admin artists PATCH fetch error:", fetchError);
    return NextResponse.json({ error: "Failed to load artist" }, { status: 500 });
  }
  if (!artist) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Idempotent no-op: already at the requested value. Returning here rather
  // than re-running the count guard means a retry on an already-founding
  // artist can never be refused by counting its own row.
  if (Boolean(artist.is_founding_artist) === isFounding) {
    await recordAdminAction({
      adminUserId,
      action: "artist.founding_status",
      context: { artist_id: artist.id, slug: artist.slug, is_founding_artist: isFounding, noop: true },
    });
    return NextResponse.json({ success: true, is_founding_artist: isFounding });
  }

  if (isFounding) {
    const { count: foundingCount, error: countError } = await db
      .from("artist_profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_founding_artist", true);
    if (countError) {
      console.error("Admin artists PATCH count error:", countError);
      return NextResponse.json({ error: "Failed to check the founding cohort" }, { status: 500 });
    }
    if ((foundingCount ?? 0) >= FOUNDING_ARTIST_LIMIT) {
      return NextResponse.json(
        { error: `The founding cohort is full (${FOUNDING_ARTIST_LIMIT} artists).` },
        { status: 409 },
      );
    }
  }

  const { error: updateError } = await db
    .from("artist_profiles")
    .update({ is_founding_artist: isFounding })
    .eq("id", artist.id);

  if (updateError) {
    console.error("Admin artists PATCH update error:", updateError);
    return NextResponse.json({ error: "Failed to update artist" }, { status: 500 });
  }

  await recordAdminAction({
    adminUserId,
    action: "artist.founding_status",
    context: { artist_id: artist.id, slug: artist.slug, is_founding_artist: isFounding },
  });
  return NextResponse.json({ success: true, is_founding_artist: isFounding });
}
