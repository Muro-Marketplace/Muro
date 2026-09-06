// Reporting content: an artwork, an artist profile, a venue profile, a collection.
//
// Conversations have had a report path since #20 (`POST /api/messages/report`,
// writing `conversation_reports`). Nothing else did. The marketplace's primary
// content is user-uploaded artwork images and the profiles around them, and
// there was no way for anyone to flag any of it.
//
// The table was already there and waiting: migration 060 created `reports` with
// `reported_entity_type` / `reported_entity_id`, a partial index on the pair,
// and a header saying "no code reads/writes these yet, Phase 2 owns the UI".
// This is that writer. No migration is needed.
//
// Two things the route does NOT do, deliberately:
//
//   - It does not trust the body for who owns the reported thing. The owner is
//     resolved from the entity's own table, so a report cannot be filed against
//     an arbitrary user by anyone who can post JSON.
//   - It does not accept an anonymous report. `reports.reporter_user_id` is
//     NOT NULL with an FK to auth.users, so there is nowhere to put one. A
//     signed-out visitor is pointed at the contact form instead. Widening this
//     needs a migration and a different abuse story, so it is a decision, not
//     an oversight.

import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { reportSchema, type ReportableEntityType } from "@/lib/validations";

export const runtime = "nodejs";

/**
 * Where each reportable thing lives, and how it is addressed. Profiles are
 * addressed by slug (that is what a public URL carries); works and collections
 * by id. `owner` is the column holding the auth user the report is about;
 * `label` is what the admin alert calls the thing.
 */
const ENTITY_SOURCES: Record<
  ReportableEntityType,
  { table: string; key: string; label: string; noun: string; viaArtist: boolean }
> = {
  // Verified against information_schema on 2026-09-06: artist_works and
  // artist_collections carry artist_id and NO user_id, so both resolve their
  // owner through artist_profiles. artist_collections labels itself `name`,
  // not `title`.
  artist_work: { table: "artist_works", key: "id", label: "title", noun: "artwork", viaArtist: true },
  collection: { table: "artist_collections", key: "id", label: "name", noun: "collection", viaArtist: true },
  artist_profile: { table: "artist_profiles", key: "slug", label: "name", noun: "artist profile", viaArtist: false },
  venue_profile: { table: "venue_profiles", key: "slug", label: "name", noun: "venue profile", viaArtist: false },
};

/**
 * Who owns the reported thing, read from the entity's own table.
 *
 * Two explicit hops for a work or a collection rather than a PostgREST embed:
 * an embed alias depends on the foreign key's name and would fail as a silent
 * null rather than an error if that ever changed, which for an owner lookup is
 * the worst failure mode available. Two round-trips on a report nobody files
 * often is not a cost worth optimising.
 */
async function resolveOwner(
  db: ReturnType<typeof getSupabaseAdmin>,
  entityType: ReportableEntityType,
  entityId: string,
): Promise<{ userId: string | null; label: string | null } | null> {
  const source = ENTITY_SOURCES[entityType];

  if (!source.viaArtist) {
    const { data } = await db
      .from(source.table)
      .select(`user_id, ${source.label}`)
      .eq(source.key, entityId)
      .maybeSingle<Record<string, unknown>>();
    if (!data) return null;
    return {
      userId: (data.user_id as string | null) ?? null,
      label: (data[source.label] as string | null) ?? null,
    };
  }

  const { data: entity } = await db
    .from(source.table)
    .select(`artist_id, ${source.label}`)
    .eq(source.key, entityId)
    .maybeSingle<Record<string, unknown>>();
  if (!entity) return null;

  const artistId = entity.artist_id as string | null;
  const label = (entity[source.label] as string | null) ?? null;
  if (!artistId) return { userId: null, label };

  const { data: profile } = await db
    .from("artist_profiles")
    .select("user_id")
    .eq("id", artistId)
    .maybeSingle<{ user_id: string | null }>();
  return { userId: profile?.user_id ?? null, label };
}

export async function POST(request: Request) {
  // Same shape as the conversation report: 6 a minute is generous for a human
  // and useless for filling the queue.
  const limited = await checkRateLimit(request, 6, 60_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_report",
        message: "Tell us what you are reporting and why.",
        issues: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 },
    );
  }
  const { entityType, entityId, reason, detail } = parsed.data;

  const db = getSupabaseAdmin();

  const owner = await resolveOwner(db, entityType, entityId);
  if (!owner) {
    // 404 rather than 400: the id came off a public page, so "not found" is the
    // honest answer and it does not confirm anything about ids that do exist.
    return NextResponse.json({ error: "not_found", message: "We could not find that." }, { status: 404 });
  }

  if (owner.userId && owner.userId === auth.user!.id) {
    return NextResponse.json(
      { error: "self_report", message: "That is your own content. If you want it removed, delete it or contact us." },
      { status: 400 },
    );
  }

  // One text column holds both halves so the queue can be filtered on the code
  // and still read the sentence. `detail` is already bounded at 2,000 by the
  // schema; the slice is belt and braces against a future widening.
  const storedReason = detail ? `${reason}: ${detail.slice(0, 2000)}` : reason;

  const { data: report, error } = await db
    .from("reports")
    .insert({
      reporter_user_id: auth.user!.id,
      reported_user_id: owner.userId,
      reported_entity_type: entityType,
      reported_entity_id: entityId,
      reason: storedReason,
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[reports] insert FAILED, the report is lost:", (error as { message?: string }).message, {
      reporter: auth.user!.id,
      entityType,
      entityId,
      reason,
    });
    return NextResponse.json(
      { error: "report_not_recorded", message: "We could not record that report. Please try again." },
      { status: 500 },
    );
  }

  // A row nobody watches is not a report. Same lesson as conversation_reports:
  // keyed on the stored row so one report is one alert however many times the
  // send is retried, with a content-derived fallback (no timestamp) for the
  // insert that lands but returns nothing.
  const reporter = auth.user!;
  const source = ENTITY_SOURCES[entityType];
  const alertKey = report?.id ?? `${reporter.id}:${entityType}:${entityId}:${reason}`;
  try {
    await sendAdminAlert({
      idempotencyKey: `admin_content_report:${alertKey}`,
      subject: `${source.noun} reported: ${owner.label || entityId}`,
      summary: `${reporter.email ?? reporter.id} reported ${source.noun} "${owner.label || entityId}".`,
      fields: [
        { label: "Report", value: report?.id ?? "(id not returned)" },
        { label: "Reporter", value: `${reporter.email ?? ""} (${reporter.id})` },
        { label: "Type", value: entityType },
        { label: "Id", value: entityId },
        { label: "Owner", value: owner.userId ?? "(unowned)" },
        { label: "Reason", value: storedReason.slice(0, 500) },
      ],
      actionPath: "/admin/moderation",
      actionLabel: "Open moderation",
    });
  } catch (err) {
    console.error("[reports] admin alert failed:", err);
  }

  return NextResponse.json({ ok: true });
}
