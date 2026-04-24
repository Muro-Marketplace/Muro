import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { z } from "zod";

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
  // F43 — venue-approval tickbox. Only the venue party can set it; if they
  // do, stamp the timestamp. Unchecking clears the timestamp.
  if (d.venueApproved !== undefined) {
    if (placement.venue_user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Only the venue can approve" }, { status: 403 });
    }
    row.venue_approved = d.venueApproved;
    row.venue_approved_at = d.venueApproved ? new Date().toISOString() : null;
  }

  const { data: existing } = await db
    .from("placement_records")
    .select("id")
    .eq("placement_id", id)
    .maybeSingle();

  if (existing) {
    const { error } = await db.from("placement_records").update(row).eq("placement_id", id);
    if (error) {
      console.error("placement_records update error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  } else {
    const { error } = await db.from("placement_records").insert(row);
    if (error) {
      console.error("placement_records insert error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
