import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { sendEmail } from "@/lib/email/send";
import { PlacementConsignmentRecordCreated } from "@/emails/templates/placements/PlacementConsignmentRecordCreated";
import { PlacementContractCountersigned } from "@/emails/templates/placements/PlacementContractCountersigned";
import { z } from "zod";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

const recordSchema = z.object({
  recordType: z.enum(["loan", "consignment"]).optional(),
  qrEnabled: z.boolean().optional(),

  startDate: z.string().max(32).nullable().optional(),
  reviewDate: z.string().max(32).nullable().optional(),
  collectionDate: z.string().max(32).nullable().optional(),

  agreedValueGbp: z.number().min(0).max(10_000_000).nullable().optional(),
  insuredValueGbp: z.number().min(0).max(10_000_000).nullable().optional(),
  salePriceGbp: z.number().min(0).max(10_000_000).nullable().optional(),
  venueSharePercent: z.number().min(0).max(100).nullable().optional(),
  platformCommissionPercent: z.number().min(0).max(100).nullable().optional(),
  artistPayoutTerms: z.string().max(2000).optional(),
  monthlyDisplayFeeGbp: z.number().min(0).max(100_000).nullable().optional(),

  conditionIn: z.string().max(2000).optional(),
  conditionOut: z.string().max(2000).optional(),
  damageNotes: z.string().max(2000).optional(),

  locationInVenue: z.string().max(500).optional(),
  pieceCount: z.number().int().min(1).max(1000).optional(),

  deliveredBy: z.string().max(200).optional(),
  collectionResponsible: z.string().max(200).optional(),

  exclusiveToVenue: z.boolean().optional(),
  availableForSale: z.boolean().optional(),

  logisticsNotes: z.string().max(4000).optional(),
  // Accept blank or any reasonable URL/string — pasted Drive/Dropbox
  // links don't always parse with strict z.url() and the user just sees
  // an opaque "invalid URL" error. We do a lightweight client-side
  // check on save instead.
  contractAttachmentUrl: z.string().max(2000).optional(),
  internalNotes: z.string().max(4000).optional(),
  venueApproved: z.boolean().optional(),
  // Bilateral approval: both parties now tick to finalise the record.
  // The API gates each field to the relevant role so artists can't
  // tick the venue's box and vice versa.
  artistApproved: z.boolean().optional(),
});

// Upsert placement_record. Only parties of the placement may write.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Valid id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) {
    // Surface the offending fields and reasons. Generic "Invalid record
    // data" left users staring at a form with no clue what to fix —
    // most often it was an empty contract URL parsed as URL, or an
    // out-of-range percentage from a paste.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "_root";
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    const fields = Object.keys(fieldErrors);
    return NextResponse.json(
      {
        error: fields.length === 1
          ? `${fields[0]}: ${fieldErrors[fields[0]]}`
          : `Some fields need attention: ${fields.join(", ")}.`,
        fieldErrors,
      },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const { data: placement } = await db
    .from("placements")
    .select("artist_user_id, venue_user_id")
    .eq("id", id)
    .single();

  if (!placement) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (placement.artist_user_id !== auth.user!.id && placement.venue_user_id !== auth.user!.id) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  const d = parsed.data;
  const row: Record<string, unknown> = {
    placement_id: id,
    artist_user_id: placement.artist_user_id,
    venue_user_id: placement.venue_user_id,
    updated_at: new Date().toISOString(),
  };
  if (d.recordType !== undefined) row.record_type = d.recordType;
  if (d.qrEnabled !== undefined) row.qr_enabled = d.qrEnabled;
  if (d.startDate !== undefined) row.start_date = d.startDate || null;
  if (d.reviewDate !== undefined) row.review_date = d.reviewDate || null;
  if (d.collectionDate !== undefined) row.collection_date = d.collectionDate || null;
  if (d.agreedValueGbp !== undefined) row.agreed_value_gbp = d.agreedValueGbp;
  if (d.insuredValueGbp !== undefined) row.insured_value_gbp = d.insuredValueGbp;
  if (d.salePriceGbp !== undefined) row.sale_price_gbp = d.salePriceGbp;
  if (d.venueSharePercent !== undefined) row.venue_share_percent = d.venueSharePercent;
  if (d.platformCommissionPercent !== undefined) row.platform_commission_percent = d.platformCommissionPercent;
  if (d.artistPayoutTerms !== undefined) row.artist_payout_terms = d.artistPayoutTerms;
  if (d.monthlyDisplayFeeGbp !== undefined) row.monthly_display_fee_gbp = d.monthlyDisplayFeeGbp;
  if (d.conditionIn !== undefined) row.condition_in = d.conditionIn;
  if (d.conditionOut !== undefined) row.condition_out = d.conditionOut;
  if (d.damageNotes !== undefined) row.damage_notes = d.damageNotes;
  if (d.locationInVenue !== undefined) row.location_in_venue = d.locationInVenue;
  if (d.pieceCount !== undefined) row.piece_count = d.pieceCount;
  if (d.deliveredBy !== undefined) row.delivered_by = d.deliveredBy;
  if (d.collectionResponsible !== undefined) row.collection_responsible = d.collectionResponsible;
  if (d.exclusiveToVenue !== undefined) row.exclusive_to_venue = d.exclusiveToVenue;
  if (d.availableForSale !== undefined) row.available_for_sale = d.availableForSale;
  if (d.logisticsNotes !== undefined) row.logistics_notes = d.logisticsNotes;
  if (d.contractAttachmentUrl !== undefined) row.contract_attachment_url = d.contractAttachmentUrl;
  if (d.internalNotes !== undefined) row.internal_notes = d.internalNotes;
  // Bilateral approval tickboxes. Each party can only tick their own
  // box; the other side must submit for themselves before the record
  // counts as finalised.
  if (d.venueApproved !== undefined) {
    if (placement.venue_user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Only the venue can approve the record on the venue's behalf." }, { status: 403 });
    }
    row.venue_approved = d.venueApproved;
    row.venue_approved_at = d.venueApproved ? new Date().toISOString() : null;
  }
  if (d.artistApproved !== undefined) {
    if (placement.artist_user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Only the artist can approve the record on the artist's behalf." }, { status: 403 });
    }
    row.artist_approved = d.artistApproved;
    row.artist_approved_at = d.artistApproved ? new Date().toISOString() : null;
  }

  // Pull the full existing row so we can diff + snapshot. For a new
  // record there's nothing to snapshot; we insert straight away and
  // skip the re-approval reset (the initial save has nothing to reset).
  const { data: existing } = await db
    .from("placement_records")
    .select("*")
    .eq("placement_id", id)
    .maybeSingle();

  // Detect which CONTENT fields actually changed. Approval ticks +
  // timestamps are explicitly excluded: toggling approval must never
  // reset the other party's approval, only actual terms changes do.
  const APPROVAL_COLUMNS = new Set([
    "venue_approved", "venue_approved_at",
    "artist_approved", "artist_approved_at",
    "updated_at",
  ]);
  function valuesDiffer(a: unknown, b: unknown): boolean {
    if (a === b) return false;
    // treat null / undefined / "" as equivalent so ticking through a
    // blank field doesn't spuriously look like a change.
    const aEmpty = a === null || a === undefined || a === "";
    const bEmpty = b === null || b === undefined || b === "";
    if (aEmpty && bEmpty) return false;
    if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) !== JSON.stringify(b);
    return a !== b;
  }
  const changedFields: string[] = [];
  if (existing) {
    for (const [key, val] of Object.entries(row)) {
      if (APPROVAL_COLUMNS.has(key)) continue;
      if (key === "placement_id" || key === "artist_user_id" || key === "venue_user_id") continue;
      if (valuesDiffer((existing as Record<string, unknown>)[key], val)) {
        changedFields.push(key);
      }
    }
  }
  const contentChanged = changedFields.length > 0;

  // If real content changed, snapshot the current row and reset both
  // approval ticks. The two parties have to re-approve the revised
  // terms — this is what gives each side confidence the other isn't
  // editing behind their back.
  if (existing && contentChanged) {
    const changedByRole = placement.artist_user_id === auth.user!.id ? "artist" : "venue";
    const versionInsert = await db.from("placement_record_versions").insert({
      placement_id: id,
      version_of_record_id: (existing as Record<string, unknown>).id || null,
      changed_by_user_id: auth.user!.id,
      changed_by_role: changedByRole,
      snapshot: existing,
      changed_fields: changedFields,
    });
    if (versionInsert.error) {
      // Non-fatal: if the migration hasn't been applied, we still save
      // the edit rather than blocking the user.
      console.warn("placement_record_versions insert skipped:", versionInsert.error.message);
    }
    // Reset approvals — force a re-sign by both parties.
    row.venue_approved = false;
    row.venue_approved_at = null;
    row.artist_approved = false;
    row.artist_approved_at = null;
  }

  // Retry path: artist_approved / artist_approved_at may not exist yet in
  // older environments (migration 031). Strip those columns and try again
  // so the rest of the record still saves.
  async function upsertWithRetry(rowToWrite: Record<string, unknown>) {
    const target = existing
      ? db.from("placement_records").update(rowToWrite).eq("placement_id", id)
      : db.from("placement_records").insert(rowToWrite);
    let res = await target;
    if (res.error) {
      const msg = String(res.error.message || "").toLowerCase();
      if (msg.includes("artist_approved")) {
        const { artist_approved, artist_approved_at, ...safe } = rowToWrite as Record<string, unknown>;
        const retry = existing
          ? await db.from("placement_records").update(safe).eq("placement_id", id)
          : await db.from("placement_records").insert(safe);
        res = retry;
      }
    }
    return res;
  }

  const { error } = await upsertWithRetry(row);
  if (error) {
    console.error("placement_records save error:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // ─── Email triggers ───
  //   1. First-ever create → PlacementConsignmentRecordCreated (both parties)
  //   2. Both parties now approved → PlacementContractCountersigned (both parties)
  // Best-effort; failures don't roll back the save.
  try {
    const wasNewRecord = !existing;
    const prevVenueApproved = existing ? (existing as Record<string, unknown>).venue_approved === true : false;
    const prevArtistApproved = existing ? (existing as Record<string, unknown>).artist_approved === true : false;
    const nextVenueApproved = "venue_approved" in row
      ? row.venue_approved === true
      : prevVenueApproved && !contentChanged;
    const nextArtistApproved = "artist_approved" in row
      ? row.artist_approved === true
      : prevArtistApproved && !contentChanged;
    const transitionedToBoth =
      (nextVenueApproved && nextArtistApproved) &&
      (!prevVenueApproved || !prevArtistApproved || contentChanged);

    if (wasNewRecord || transitionedToBoth) {
      const [{ data: { user: artistUser } }, { data: { user: venueUser } }] = await Promise.all([
        db.auth.admin.getUserById(placement.artist_user_id),
        db.auth.admin.getUserById(placement.venue_user_id),
      ]);
      const [{ data: artistP }, { data: venueP }] = await Promise.all([
        db.from("artist_profiles").select("name").eq("user_id", placement.artist_user_id).single(),
        db.from("venue_profiles").select("name").eq("user_id", placement.venue_user_id).single(),
      ]);
      const artistName = artistP?.name || "The artist";
      const venueName = venueP?.name || "The venue";
      const placementUrl = `${SITE}/placements/${encodeURIComponent(id)}`;
      const recordOpenUrl = `${placementUrl}?record=open`;

      if (wasNewRecord) {
        for (const party of [
          { user: artistUser, name: artistName, uid: placement.artist_user_id },
          { user: venueUser, name: venueName, uid: placement.venue_user_id },
        ]) {
          if (!party.user?.email) continue;
          await sendEmail({
            idempotencyKey: `record_created:${id}:${party.uid}`,
            template: "placement_consignment_record_created",
            category: "legal",
            to: party.user.email,
            subject: `Consignment record ready for ${artistName} × ${venueName}`,
            userId: party.uid,
            react: PlacementConsignmentRecordCreated({
              firstName: party.name.split(" ")[0] || "there",
              placementUrl,
              consignmentRecordUrl: recordOpenUrl,
              venueName,
              artistName,
              works: [],
              termsSummary: d.recordType ? `${d.recordType}${d.monthlyDisplayFeeGbp ? ` · £${d.monthlyDisplayFeeGbp}/mo` : ""}${d.venueSharePercent ? ` · ${d.venueSharePercent}% to venue` : ""}` : "Terms pending",
            }),
            metadata: { placementId: id },
          });
        }
      }

      if (transitionedToBoth) {
        const signedAt = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
        for (const party of [
          { user: artistUser, name: artistName, uid: placement.artist_user_id, counter: venueName },
          { user: venueUser, name: venueName, uid: placement.venue_user_id, counter: artistName },
        ]) {
          if (!party.user?.email) continue;
          await sendEmail({
            idempotencyKey: `record_countersigned:${id}:${party.uid}:${signedAt}`,
            template: "placement_contract_countersigned",
            category: "legal",
            to: party.user.email,
            subject: `Contract countersigned by ${party.counter}`,
            userId: party.uid,
            react: PlacementContractCountersigned({
              firstName: party.name.split(" ")[0] || "there",
              placementUrl,
              contractUrl: recordOpenUrl,
              signedAt,
              counterpartyName: party.counter,
            }),
            metadata: { placementId: id },
          });
        }
      }
    }
  } catch (err) {
    console.error("Record email error:", err);
  }

  return NextResponse.json({
    success: true,
    changedFields,
    approvalsReset: contentChanged,
  });
}

