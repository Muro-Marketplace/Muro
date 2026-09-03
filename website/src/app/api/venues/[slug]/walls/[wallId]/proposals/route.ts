/**
 * POST /api/venues/[slug]/walls/[wallId]/proposals
 *
 * An artist stores the wall they built on a venue's public wall: the
 * editor's capture plus the items, under a placement id they are about to
 * send. See src/lib/placements/wall-proposals.ts for where that lands and
 * why the placement row itself never changes.
 *
 * Pipeline:
 *   1. Flag, auth, artist profile (403 when none or still under review,
 *      the same copy as POST /api/placements).
 *   2. The wall must be the venue's and public (404 either way, same helper
 *      as the public wall read), and not the caller's own venue.
 *   3. Body: multipart with `image` (WebP or PNG by magic bytes, 8 MB cap),
 *      `items` (JSON, 1 to 20 items, every work the caller's own) and
 *      `placementId` (1 to 100 chars, not yet a placement).
 *   4. Abuse guard: 20 proposals per artist per rolling day.
 *   5. createWallProposal, which stores the layout and the capture.
 *
 * Quota: none, the artist's own browser did the work. Body size: Vercel
 * refuses bodies above roughly 4.5 MB before this code runs; a 2400 px WebP
 * is a few hundred KB.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { isFlagOn } from "@/lib/feature-flags";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertOwnsArtistProfile, handleAuthzError } from "@/lib/authz";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  countRecentWallProposals,
  createWallProposal,
  placementExists,
} from "@/lib/placements/wall-proposals";
import { findPublicVenueWall } from "@/lib/venues/public-walls";
import {
  PREVIEW_CONTENT_TYPES,
  PREVIEW_MAX_BYTES,
  sniffPreviewImage,
} from "@/lib/visualizer/preview-image";
import { wallLayoutItemsSchema } from "@/lib/visualizer/validations";

export const dynamic = "force-dynamic";

/** Proposals one artist may store per rolling day. */
const PROPOSALS_PER_DAY = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Room for the items JSON and the form boundaries around the image. */
const FORM_OVERHEAD_BYTES = 256 * 1024;

const itemsSchema = wallLayoutItemsSchema
  .min(1, "Place at least one artwork on the wall")
  .max(20, "A proposal can hold at most 20 artworks");
const placementIdSchema = z.string().trim().min(1).max(100);

interface RouteContext {
  params: Promise<{ slug: string; wallId: string }>;
}

type BodyResult =
  | { ok: true; bytes: Uint8Array; itemsRaw: string; placementId: string }
  | { ok: false; response: NextResponse };

function reject(status: number, error: string, extra: Record<string, unknown> = {}): BodyResult {
  return { ok: false, response: NextResponse.json({ error, ...extra }, { status }) };
}

function tooLarge(): BodyResult {
  return reject(
    413,
    `Preview too large. Max ${Math.round(PREVIEW_MAX_BYTES / 1024 / 1024)} MB.`,
  );
}

/**
 * The three parts of the multipart body. The declared Content-Length is
 * checked before the body is buffered; the image's own size is checked again
 * after, because the header is optional and unverified.
 */
async function readProposalBody(request: Request): Promise<BodyResult> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > PREVIEW_MAX_BYTES + FORM_OVERHEAD_BYTES) {
    return tooLarge();
  }
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("multipart/form-data")) {
    return reject(400, "Expected multipart/form-data with 'image', 'items' and 'placementId' parts");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject(400, "Expected multipart/form-data with 'image', 'items' and 'placementId' parts");
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) return reject(400, "Missing 'image' part");
  if (image.size === 0) return reject(400, "Image is empty");
  if (image.size > PREVIEW_MAX_BYTES) return tooLarge();
  const itemsRaw = form.get("items");
  if (typeof itemsRaw !== "string") return reject(400, "Missing 'items' part");
  const placementId = form.get("placementId");
  if (typeof placementId !== "string") return reject(400, "Missing 'placementId' part");
  return { ok: true, bytes: new Uint8Array(await image.arrayBuffer()), itemsRaw, placementId };
}

export async function POST(request: Request, ctx: RouteContext) {
  if (!isFlagOn("WALL_VISUALIZER_V1")) {
    return NextResponse.json({ error: "Not enabled" }, { status: 404 });
  }
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  const userId = auth.user!.id;
  const { slug, wallId } = await ctx.params;

  try {
    const db = getSupabaseAdmin();

    const profile = await assertOwnsArtistProfile(auth.user!, db);
    if (profile.review_status === "pending") {
      return NextResponse.json(
        {
          error:
            "Your application is still under review. You'll be able to send placement requests once we've approved your profile.",
          reason: "application_pending",
        },
        { status: 403 },
      );
    }

    const found = await findPublicVenueWall(slug, wallId, db);
    if (!found) {
      return NextResponse.json({ error: "Wall not found" }, { status: 404 });
    }
    if (found.venue.user_id === userId) {
      return NextResponse.json(
        { error: "You can't propose work for your own venue's wall." },
        { status: 400 },
      );
    }

    const body = await readProposalBody(request);
    if (!body.ok) return body.response;

    const format = sniffPreviewImage(body.bytes);
    if (!format) {
      return NextResponse.json(
        { error: "Unsupported image. The preview must be WebP or PNG." },
        { status: 400 },
      );
    }

    let itemsJson: unknown;
    try {
      itemsJson = JSON.parse(body.itemsRaw);
    } catch {
      return NextResponse.json({ error: "'items' must be JSON" }, { status: 400 });
    }
    const items = itemsSchema.safeParse(itemsJson);
    if (!items.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: items.error.issues },
        { status: 400 },
      );
    }
    const placementId = placementIdSchema.safeParse(body.placementId);
    if (!placementId.success) {
      return NextResponse.json(
        { error: "placementId must be 1 to 100 characters" },
        { status: 400 },
      );
    }

    // Every artwork on the wall must be one of the caller's own works.
    const workIds = Array.from(new Set(items.data.map((i) => i.work_id)));
    const { data: ownedRows, error: worksErr } = await db
      .from("artist_works")
      .select("id")
      .eq("artist_id", profile.id)
      .in("id", workIds);
    if (worksErr) {
      console.error("[wall proposals] work lookup failed:", worksErr.message);
      return NextResponse.json({ error: "Could not check your works" }, { status: 500 });
    }
    const owned = new Set(((ownedRows ?? []) as Array<{ id: string }>).map((r) => r.id));
    if (workIds.some((id) => !owned.has(id))) {
      return NextResponse.json(
        { error: "Every artwork on the wall must be one of your own works.", reason: "work_not_owned" },
        { status: 400 },
      );
    }

    const exists = await placementExists(placementId.data, db);
    if (exists === null) {
      return NextResponse.json({ error: "Could not check the placement id" }, { status: 500 });
    }
    if (exists) {
      return NextResponse.json(
        { error: "A placement with this id already exists.", reason: "placement_exists" },
        { status: 409 },
      );
    }

    const recent = await countRecentWallProposals(userId, new Date(Date.now() - DAY_MS), db);
    if (recent >= PROPOSALS_PER_DAY) {
      return NextResponse.json(
        {
          error: `You've sent ${PROPOSALS_PER_DAY} wall proposals in the last 24 hours. Try again tomorrow.`,
          reason: "wall_proposal_cap",
        },
        { status: 429 },
      );
    }

    const created = await createWallProposal(
      {
        artistUserId: userId,
        wall: found.wall,
        items: items.data,
        placementId: placementId.data,
        imageBuffer: Buffer.from(body.bytes),
        contentType: PREVIEW_CONTENT_TYPES[format],
      },
      db,
    );
    if (!created) {
      return NextResponse.json(
        { error: "Failed to save the proposal", reason: "persistence_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ layoutId: created.layoutId, previewUrl: created.previewUrl });
  } catch (err) {
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[wall proposals] unhandled error", err);
    return NextResponse.json({ error: "Could not save the proposal" }, { status: 500 });
  }
}
