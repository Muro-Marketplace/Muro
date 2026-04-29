import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getArtistProfileByUserId } from "@/lib/db/artist-profiles";
import { getWorksByArtistProfileId, upsertWork, deleteWork } from "@/lib/db/artist-works";
import { slugify } from "@/lib/slugify";

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

  const result = await getArtistProfileByUserId(auth.user!.id);
  if (!result) {
    return NextResponse.json({ error: "No artist profile found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const { id, title, medium, dimensions, priceBand, pricing, available, color, image, orientation, sortOrder, shippingPrice, inStorePrice, quantityAvailable, frameOptions, description, images } = body;

    if (!id || !title || !image) {
      return NextResponse.json({ error: "ID, title, and image are required" }, { status: 400 });
    }

    // Posting limit per tier (#24). Core 8, Premium 20, Pro 50.
    // Updates to an existing work don't count against the cap,
    // only new IDs do.
    const POST_LIMITS: Record<string, number> = { core: 8, premium: 20, pro: 50 };
    const postPlan = (result.profile.subscription_plan || "core").toLowerCase();
    const postLimit = POST_LIMITS[postPlan] ?? POST_LIMITS.core;
    const existingWorks = await getWorksByArtistProfileId(result.profile.id);
    const isNewWork = !existingWorks.some((w) => w.id === id);
    if (isNewWork && existingWorks.length >= postLimit) {
      const planLabel = postPlan.charAt(0).toUpperCase() + postPlan.slice(1);
      return NextResponse.json(
        {
          error: "post_limit_reached",
          message: `Your ${planLabel} plan supports up to ${postLimit} active works. Archive an existing work or upgrade your plan to add more.`,
          limit: postLimit,
          current: existingWorks.length,
          plan: postPlan,
        },
        { status: 403 },
      );
    }

    // Sanitize the frame options. Each frame may carry an optional
    // imageUrl thumbnail and a `pricesBySize` map of size-label → £
    // uplift overrides for that size. Both are validated independently
    // so a malformed extras blob doesn't poison the row.
    const sanitizedFrames = Array.isArray(frameOptions)
      ? frameOptions
          .filter((f: unknown): f is {
            label: string;
            priceUplift: number;
            imageUrl?: unknown;
            pricesBySize?: unknown;
          } =>
            !!f && typeof f === "object" && typeof (f as { label?: unknown }).label === "string" &&
            typeof (f as { priceUplift?: unknown }).priceUplift === "number" &&
            ((f as { label: string }).label.trim().length > 0),
          )
          .slice(0, 20)
          .map((f) => {
            const out: {
              label: string;
              priceUplift: number;
              imageUrl?: string;
              pricesBySize?: Record<string, number>;
            } = {
              label: f.label.trim().slice(0, 80),
              priceUplift: Math.max(0, Math.round(f.priceUplift * 100) / 100),
            };
            if (typeof f.imageUrl === "string" && f.imageUrl.length > 0) {
              out.imageUrl = f.imageUrl.slice(0, 1000);
            }
            if (
              f.pricesBySize &&
              typeof f.pricesBySize === "object" &&
              !Array.isArray(f.pricesBySize)
            ) {
              const cleaned: Record<string, number> = {};
              for (const [k, v] of Object.entries(
                f.pricesBySize as Record<string, unknown>,
              )) {
                if (typeof k !== "string" || k.length === 0 || k.length > 100) continue;
                const n = typeof v === "number" ? v : Number(v);
                if (!Number.isFinite(n) || n < 0) continue;
                cleaned[k] = Math.round(n * 100) / 100;
              }
              if (Object.keys(cleaned).length > 0) out.pricesBySize = cleaned;
            }
            return out;
          })
      : [];

    // Tier-gated image count. Limits are TOTAL images (primary + extras).
    const IMAGE_LIMITS: Record<string, number> = { core: 3, premium: 5, pro: 10 };
    const plan = result.profile.subscription_plan || "core";
    const totalLimit = IMAGE_LIMITS[plan] ?? 3;
    const extraImagesAllowed = Math.max(0, totalLimit - 1);
    const rawExtras = Array.isArray(images)
      ? images.filter((u): u is string => typeof u === "string" && u.length > 0 && u !== image)
      : [];
    const sanitizedImages = rawExtras.slice(0, extraImagesAllowed);

    const sanitizedDescription = typeof description === "string"
      ? description.slice(0, 2000)
      : "";

    const { error, droppedColumns, savedRow, fallbackErrors } = await upsertWork(result.profile.id, {
      id,
      title,
      medium: medium || "",
      dimensions: dimensions || "",
      price_band: priceBand || "",
      pricing: pricing || [],
      available: available ?? true,
      color: color || "#C17C5A",
      image,
      orientation: orientation || "landscape",
      sort_order: sortOrder ?? 0,
      shipping_price: shippingPrice ?? null,
      in_store_price: inStorePrice ?? null,
      quantity_available: typeof quantityAvailable === "number" ? quantityAvailable : null,
      frame_options: sanitizedFrames,
      description: sanitizedDescription,
      images: sanitizedImages,
    });

    if (error) {
      console.error("Work save error:", error);
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
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE: remove a work
export async function DELETE(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

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
