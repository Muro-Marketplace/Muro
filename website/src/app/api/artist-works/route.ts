import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { assertNotDemo } from "@/lib/demo-guard";
import { handleAuthzError } from "@/lib/authz";
import { getArtistProfileByUserId } from "@/lib/db/artist-profiles";
import { getWorksByArtistProfileId, upsertWork, deleteWork } from "@/lib/db/artist-works";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Shape returned by the row-21 slot-claim RPC (migration 104). */
interface ClaimResult {
  claimed: boolean;
  created: boolean;
  current_count: number;
}
import { slugify } from "@/lib/slugify";
import { isFlagOn } from "@/lib/feature-flags";
import { isSubscribed } from "@/lib/subscriptions";
import { artistWorkInputSchema } from "@/lib/validations";

// GET: fetch works for the current user's artist profile
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ works: [] });
  }

  const works = await getWorksByArtistProfileId(result.profile.id);
  return NextResponse.json({ works });
}

// POST: create or update a work
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a. Missed by the pass-2 sweep, which filtered on a getSupabaseAdmin
  // import: this route writes through @/lib/db/artist-works instead, the same
  // blind spot that hid E32. Caught by item 15's rule extension.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ error: "No artist profile found" }, { status: 404 });
  }

  try {
    // E46a (06 B5). The body used to be destructured raw and passed straight to
    // the write: no array cap on `pricing`, no per-tier price check, no lower
    // bound on `quantity_available` (and checkout reads <= 0 as sold, so a
    // negative value made a work permanently unbuyable), and an unbounded stored
    // `shipping_price` that feeds calculateOrderShipping.
    const parsed = artistWorkInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const field = first?.path.join(".") || "body";
      return NextResponse.json(
        { error: "validation_failed", message: `${field}: ${first?.message || "invalid"}` },
        { status: 400 },
      );
    }
    const {
      id, title, medium, dimensions, priceBand, pricing, available, color, image,
      orientation, sortOrder, shippingPrice, inStorePrice, quantityAvailable, frameOptions,
      description, images,
    } = parsed.data;

    // B2 + C2 (Phase 2.5, gated by GATING_V1):
    //   - If the artist is not currently subscribed and tries to mark
    //     a work `available=true`, return 402 so the client surfaces
    //     the upgrade modal.
    //   - On a new work, force `available=false` regardless so drafts
    //     can be saved during onboarding without publishing.
    if (isFlagOn("GATING_V1")) {
      const sub = await isSubscribed(auth.user!.id);
      if (!sub.active && available === true) {
        return NextResponse.json(
          {
            error: "subscription_required",
            message: "Publishing a work requires an active Wallplace subscription.",
            upgrade_url: "/artist-portal/billing",
          },
          { status: 402 },
        );
      }
    }

    // Posting limit per tier (#24). Core 8, Premium 20, Pro 50.
    // Updates to an existing work don't count against the cap,
    // only new IDs do.
    const POST_LIMITS: Record<string, number> = { core: 8, premium: 20, pro: 50 };
    const postPlan = (result.profile.subscription_plan || "core").toLowerCase();
    const postLimit = POST_LIMITS[postPlan] ?? POST_LIMITS.core;

    // Row 21 (D64). This used to count the artist's works, compare to the cap,
    // and then insert later through upsertWork. Two concurrent POSTs both read
    // the count before either insert landed, so both passed a cap they should
    // not have, and this is a public API: the window is reachable by anyone with
    // a session.
    //
    // A plain `INSERT ... WHERE (SELECT count(*)) < limit` does not fix it —
    // under READ COMMITTED each statement takes its own snapshot at statement
    // start, so two inserts beginning before either commits still see the same
    // count. Migration 104 serialises the check and the claim per artist with an
    // advisory transaction lock, which is the only thing that closes it.
    //
    // The RPC claims a slot by inserting the four NOT NULL columns; upsertWork
    // below then finds the row and takes its update path, so its strip-and-retry
    // ladder is not reimplemented in SQL.
    const { data: claimRows, error: claimError } = await getSupabaseAdmin().rpc(
      "claim_artist_work_slot",
      {
        p_artist_id: result.profile.id,
        p_work_id: id,
        p_limit: postLimit,
        p_title: title,
        p_image: image,
      },
    );
    if (claimError) {
      console.error("[artist-works] claim_artist_work_slot failed:", claimError.message);
      return NextResponse.json({ error: "Could not save artwork" }, { status: 500 });
    }
    const claim = (claimRows as ClaimResult[] | null)?.[0];
    if (!claim?.claimed) {
      const planLabel = postPlan.charAt(0).toUpperCase() + postPlan.slice(1);
      return NextResponse.json(
        {
          error: "post_limit_reached",
          message: `Your ${planLabel} plan supports up to ${postLimit} active works. Archive an existing work or upgrade your plan to add more.`,
          limit: postLimit,
          current: claim?.current_count ?? postLimit,
          plan: postPlan,
        },
        { status: 403 },
      );
    }
    // Whether WE created the placeholder, so a failed save below releases the
    // slot instead of consuming it permanently.
    const claimedNewRow = claim.created === true;

    // The 45-line hand-rolled frameOptions sanitiser that used to sit here is
    // DELETED, not left beside the schema. artistWorkInputSchema enforces the
    // same rules (label trimmed and capped, priceUplift floored at 0, at most 20
    // frames, pricesBySize keys and values bounded), so keeping both would be two
    // sources of truth for one rule.
    const sanitizedFrames = frameOptions ?? [];

    // Tier-gated image count. Limits are TOTAL images (primary + extras).
    const IMAGE_LIMITS: Record<string, number> = { core: 3, premium: 5, pro: 10 };
    const plan = result.profile.subscription_plan || "core";
    const totalLimit = IMAGE_LIMITS[plan] ?? 3;
    const extraImagesAllowed = Math.max(0, totalLimit - 1);
    const rawExtras = (images ?? []).filter((u) => u.length > 0 && u !== image);
    const sanitizedImages = rawExtras.slice(0, extraImagesAllowed);

    // Capped by the schema now, so the manual slice is gone.
    const sanitizedDescription = description ?? "";

    // C2 (Phase 2.5, GATING_V1): default-to-draft for non-subscribed
    // artists. A new work created without an explicit `available` flag
    // is saved as a draft (available=false) until the artist either
    // upgrades or explicitly republishes it. The 402 check above
    // already short-circuits any explicit `available: true` attempt.
    let effectiveAvailable: boolean;
    if (typeof available === "boolean") {
      effectiveAvailable = available;
    } else if (isFlagOn("GATING_V1") && claimedNewRow) {
      const sub = await isSubscribed(auth.user!.id);
      effectiveAvailable = sub.active;
    } else {
      effectiveAvailable = true;
    }

    const { error, droppedColumns, savedRow, fallbackErrors } = await upsertWork(result.profile.id, {
      id,
      title,
      medium: medium || "",
      dimensions: dimensions || "",
      price_band: priceBand || "",
      pricing: pricing || [],
      available: effectiveAvailable,
      color: color || "#C17C5A",
      image,
      orientation: orientation || "landscape",
      sort_order: sortOrder ?? 0,
      shipping_price: shippingPrice ?? null,
      // Owner decision 14 (migration 118): `in_store_price` is a real column
      // now, so the value the portfolio has collected all along finally
      // persists. Before 118 this field was deliberately not forwarded (A8),
      // because the column did not exist and sending it made upsertWork's
      // per-column ladder fail on every save.
      in_store_price: inStorePrice ?? null,
      quantity_available: quantityAvailable ?? null,
      frame_options: sanitizedFrames,
      description: sanitizedDescription,
      images: sanitizedImages,
    });

    if (error) {
      console.error("Work save error:", error);
      // Row 21: the slot was claimed by inserting a placeholder row before this
      // point. If the real save failed, release it, or a failed upload would
      // permanently consume one of the artist's tier slots and they would have
      // no way to see or remove the row that took it.
      if (claimedNewRow) {
        const { error: releaseErr } = await deleteWork(id, result.profile.id);
        if (releaseErr) {
          console.error("[artist-works] could not release the claimed slot:", releaseErr.message);
        }
      }
      return NextResponse.json({ error: "Failed to save work" }, { status: 500 });
    }

    // Bust the Next.js cache so the updated work shows immediately on public pages
    try {
      revalidatePath(`/browse/${result.profile.slug}`);
      revalidatePath(`/browse/${result.profile.slug}/${slugify(title)}`);
    } catch { /* best-effort */ }

    const warnings: string[] = [];

    // Duplicate listing detection (#23). Soft warning, we don't
    // block the save, just flag potential duplicates so the artist
    // can decide whether to keep both or rename. Two checks:
    //   • another work in the same portfolio with the same trimmed
    //     case-insensitive title
    //   • another work pointing at the same primary image URL
    // Only triggers on NEW works (or title/image changes on existing
    // ones) so re-saving an unchanged work doesn't lecture you.
    {
      // Row 21: this list used to be fetched before the cap check and reused
      // here. The cap check is an atomic RPC now, so the list is read where it
      // is actually needed, AFTER the save. It therefore includes the work just
      // written, which is why both checks filter on `w.id !== id`, as they
      // always did.
      const existingWorks = await getWorksByArtistProfileId(result.profile.id);
      const cleanTitle = String(title).trim().toLowerCase();
      const dupTitle = existingWorks.find(
        (w) => w.id !== id && (w.title || "").trim().toLowerCase() === cleanTitle,
      );
      if (dupTitle) {
        warnings.push(
          `Heads up, you already have a work titled "${dupTitle.title}". If this is a different piece, consider giving it a unique title to help buyers tell them apart.`,
        );
      }
      const dupImage = existingWorks.find(
        (w) => w.id !== id && w.image && w.image === image,
      );
      if (dupImage) {
        warnings.push(
          `This image is already used by another work in your portfolio ("${dupImage.title}"). Double-check you didn't upload the same artwork twice.`,
        );
      }
    }

    if (droppedColumns && droppedColumns.length > 0) {
      console.warn("Work saved with dropped columns:", droppedColumns);
      const missingNew = ["description", "images"].filter((c) => droppedColumns.includes(c));
      if (missingNew.length > 0) {
        warnings.push(
          `${missingNew.join(" and ")} could not be saved, your database is missing these columns. Run Supabase migration 015_artwork_description_and_images.sql.`
        );
      }
      const missingOlder = ["frame_options", "quantity_available", "shipping_price"].filter((c) => droppedColumns.includes(c));
      if (missingOlder.length > 0) {
        warnings.push(
          `${missingOlder.join(", ")} could not be saved, run the pending migrations (012–014).`
        );
      }
    }

    // Diagnostic: description/images sent but not present in the row the DB returned.
    // If migration 015 is applied and the write didn't error, but the column is still empty,
    // something is silently dropping it (RLS policy, trigger, schema cache, wrong table).
    if (sanitizedDescription && savedRow && !savedRow.description) {
      const cause = fallbackErrors && fallbackErrors.length > 0
        ? ` Errors encountered: ${fallbackErrors.join(" | ")}.`
        : "";
      warnings.push(
        `Description didn't save. ${cause} Fix: in Supabase SQL editor, run: NOTIFY pgrst, 'reload schema';, then save again. If that doesn't work, contact support with the error above.`
      );
      console.error("Description drop detected", {
        workId: id,
        sent: sanitizedDescription.slice(0, 80),
        savedDescription: savedRow.description,
        savedKeys: Object.keys(savedRow),
        fallbackErrors,
      });
    }
    if (sanitizedImages.length > 0 && savedRow && (!Array.isArray(savedRow.images) || savedRow.images.length === 0)) {
      warnings.push(
        "Extra images were sent but did not persist, the DB returned an empty images column."
      );
    }

    return NextResponse.json({ success: true, warnings, savedRow });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[artist-works] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: remove a work
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;
  // E23a. Missed by the pass-2 sweep, which filtered on a getSupabaseAdmin
  // import: this route writes through @/lib/db/artist-works instead, the same
  // blind spot that hid E32. Caught by item 15's rule extension.
  const demoResp = assertNotDemo(auth.user!.id);
  if (demoResp) return demoResp;

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ error: "No artist profile found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const workId = searchParams.get("id");

  if (!workId) {
    return NextResponse.json({ error: "Work ID required" }, { status: 400 });
  }

  const { error } = await deleteWork(workId, result.profile.id);

  if (error) {
    console.error("Work delete error:", error);
    return NextResponse.json({ error: "Failed to delete work" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
