// Task 7 Part B. Migration 122 added placements.programme_request_id /
// programme_rent_gbp — both server-owned (PLACEMENT_SERVER_OWNED,
// src/lib/db/writable-fields.ts) — but deliberately shipped no writer for
// them: "an admin route linking a placement to a programme, deliberately
// left unbuilt by this task" (122's own header). Without this route, no
// placement can ever be linked to a programme, so accrueProgrammeRent()
// (Task 6) legitimately finds zero eligible placements for every programme
// in production and nothing accrues at all — this is the controller that
// makes Task 6/7 reachable, not optional polish.
//
// Deliberately NOT run through assertNoServerOwned: that guard defends
// api/placements/route.ts against a client-influenced payload reaching
// these columns by accident (a body spread, a forgotten pickWritable). This
// route IS the designated writer — the payload is built entirely from named,
// zod-validated fields, never a body spread — so calling the guard here
// would just throw on the very columns this route exists to set.
//
// Mirrors ../../curation/quote/route.ts's shape: withAdmin owns the audit
// call, a narrow zod body fails closed with a 400 before any DB round trip,
// and a state conflict on the target row is a 409, not a 500.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { PROGRAMME_PIECE_RENT_MIN_GBP } from "@/lib/curation-tiers";

const linkSchema = z.object({
  programmeRequestId: z.string().uuid(),
  // >= the floor here, not just left to programme_rent_gbp's own CHECK (>=
  // 5, migration 122): a bad value must fail as a clean 400 with a readable
  // message, not a raw 23514 constraint violation surfaced as a 500.
  rentGbp: z.number().min(PROGRAMME_PIECE_RENT_MIN_GBP),
});

interface ProgrammeRow {
  id: string;
  tier: string;
}

/**
 * Existence-only guard: neither caller needs the placement row's data, just
 * whether `id` names one at all. Returns the error response to short-circuit
 * with, or null when the placement exists and the caller should proceed.
 */
async function placementExistsError(
  db: ReturnType<typeof getSupabaseAdmin>,
  id: string,
): Promise<NextResponse | null> {
  const { data, error } = await db
    .from("placements")
    .select("id")
    .eq("id", id)
    .maybeSingle<{ id: string }>();
  if (error) {
    console.error("[admin/placements link-programme] placement lookup error:", error);
    return NextResponse.json({ error: "Failed to load placement" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }
  return null;
}

/**
 * POST — link a placement to a programme and set its agreed rent.
 * Idempotent in effect: linking an already-linked placement to a
 * (possibly different) programme simply overwrites both columns, which is
 * the correct behaviour for a rotation onto a new programme wall.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(request, "placement_programme_linked", async ({ audit }) => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    const { programmeRequestId, rentGbp } = parsed.data;

    const db = getSupabaseAdmin();

    const placementError = await placementExistsError(db, id);
    if (placementError) return placementError;

    const { data: programme, error: programmeError } = await db
      .from("curation_requests")
      .select("id, tier")
      .eq("id", programmeRequestId)
      .maybeSingle<ProgrammeRow>();
    if (programmeError) {
      console.error("[admin/placements link-programme] programme lookup error:", programmeError);
      return NextResponse.json({ error: "Failed to load programme" }, { status: 500 });
    }
    // Missing row and wrong-tier row collapse to the same 409: either way
    // the id named is not a valid programme to link against.
    if (!programme || programme.tier !== "programme") {
      return NextResponse.json(
        { error: "Target curation request is not a programme." },
        { status: 409 },
      );
    }

    const { error: updateError } = await db
      .from("placements")
      .update({
        programme_request_id: programmeRequestId,
        programme_rent_gbp: rentGbp,
      })
      .eq("id", id);
    if (updateError) {
      console.error("[admin/placements link-programme] update error:", updateError);
      return NextResponse.json({ error: "Failed to link the placement" }, { status: 500 });
    }

    audit({ placementId: id, programmeRequestId, rentGbp });

    return NextResponse.json({ success: true, placementId: id, programmeRequestId, rentGbp });
  });
}

/**
 * DELETE — unlink a placement from its programme (clears both columns).
 * A piece coming off a wall at rotation stops accruing rent from here on;
 * accrual rows already written are untouched (accrueProgrammeRent only
 * looks at CURRENTLY-linked, active placements, so an unlinked placement
 * simply stops matching from the next invoice onward).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdmin(request, "placement_programme_unlinked", async ({ audit }) => {
    const { id } = await params;
    const db = getSupabaseAdmin();

    const placementError = await placementExistsError(db, id);
    if (placementError) return placementError;

    const { error: updateError } = await db
      .from("placements")
      .update({
        programme_request_id: null,
        programme_rent_gbp: null,
      })
      .eq("id", id);
    if (updateError) {
      console.error("[admin/placements link-programme] unlink error:", updateError);
      return NextResponse.json({ error: "Failed to unlink the placement" }, { status: 500 });
    }

    audit({ placementId: id });

    return NextResponse.json({ success: true, placementId: id, unlinked: true });
  });
}
