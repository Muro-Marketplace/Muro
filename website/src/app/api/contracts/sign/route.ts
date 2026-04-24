// POST /api/contracts/sign
//
// Exchange a stored contract reference for a short-lived signed URL so the
// party viewing the contract can download it without the underlying file
// being public.
//
// Inputs:  { placementId: string, ref: string }
//          `ref` comes from `placement_records.contract_attachment_url` and
//          uses the `contract:<bucket>/<path>` prefix (see src/lib/upload.ts).
//          Legacy public-URL values are accepted and passed through unchanged
//          — they pre-date this route and are already world-readable, so the
//          signed-URL step adds nothing.
//
// Security:
//   - Auth required.
//   - User must be a party (artist or venue) on the placement.
//   - Signed URL expires in 10 minutes — enough for a download, short
//     enough that a leaked link is low value.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { isContractRef, parseContractRef } from "@/lib/upload";
import { z } from "zod";

const bodySchema = z.object({
  placementId: z.string().min(1).max(100),
  ref: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid placementId and ref required" }, { status: 400 });
  }
  const { placementId, ref } = parsed.data;

  const db = getSupabaseAdmin();

  // Party check — only artist or venue on the placement may sign.
  const { data: placement } = await db
    .from("placements")
    .select("artist_user_id, venue_user_id")
    .eq("id", placementId)
    .single();

  if (!placement) {
    return NextResponse.json({ error: "Placement not found" }, { status: 404 });
  }
  const isParty =
    placement.artist_user_id === auth.user!.id ||
    placement.venue_user_id === auth.user!.id;
  if (!isParty) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }

  // Legacy row — the value is already a public URL. Return it as-is so the
  // caller can link to it. Nothing to sign.
  if (!isContractRef(ref)) {
    if (/^https?:\/\//.test(ref)) {
      return NextResponse.json({ signedUrl: ref, legacy: true });
    }
    return NextResponse.json({ error: "Invalid contract reference" }, { status: 400 });
  }

  // Verify the ref actually matches the stored record so a party to one
  // placement can't sign the contract of a DIFFERENT placement by passing
  // its ref directly.
  const { data: record } = await db
    .from("placement_records")
    .select("contract_attachment_url")
    .eq("placement_id", placementId)
    .maybeSingle();
  if (!record || record.contract_attachment_url !== ref) {
    return NextResponse.json({ error: "Contract not found on this placement" }, { status: 404 });
  }

  const parts = parseContractRef(ref);
  if (!parts) {
    return NextResponse.json({ error: "Malformed reference" }, { status: 400 });
  }

  // 10-minute signed URL. The user clicks, downloads; the link dies soon after.
  const { data: signed, error: signErr } = await db.storage
    .from(parts.bucket)
    .createSignedUrl(parts.path, 60 * 10);
  if (signErr || !signed?.signedUrl) {
    console.error("createSignedUrl error:", signErr);
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: signed.signedUrl });
}
