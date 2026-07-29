import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getVenueProfileByUserId, upsertVenueProfile } from "@/lib/db/venue-profiles";
import { pickWritable, VENUE_PROFILE_WRITABLE } from "@/lib/db/writable-fields";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slugify";
import type { User } from "@supabase/supabase-js";

// GET: fetch the current user's venue profile
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const profile = await getVenueProfileByUserId(auth.user!.id);
  return NextResponse.json({ profile: profile || null });
}

// PUT: update venue profile
export async function PUT(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    // E45. Passing `body` straight through spread the whole venue_profiles row
    // into a service-role update: squat another venue's slug, self-grant a paid
    // subscription_plan, set the stripe_* columns, or write user_id, which lands
    // in SET while the WHERE still matches the caller, handing your own row to
    // another account.
    const { error } = await upsertVenueProfile(
      auth.user!.id,
      // The allowlist guarantees the KEYS, not the value types: these came from
      // JSON, so they are `unknown` until something validates their shape. That
      // is 06 A3's zod schema (and E46a's numeric bounds), not this cast. The
      // cast states the current position honestly rather than implying the values
      // have been checked.
      pickWritable(body, VENUE_PROFILE_WRITABLE) as Parameters<typeof upsertVenueProfile>[1],
    );

    if (error) {
      console.error("Venue profile update error:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// PATCH: partial updates — also handles ensureProfile self-heal (the
// successor to adoptIfOrphan). Guarantees a venue_profiles row keyed to
// the caller's user_id exists by the time the request returns. Without
// this, a venue user whose row never made it past the registration race
// is permanently broken: the portal lets them in (user_metadata says
// "venue") but every venue-only API errors because the server keys off
// venue_profiles.user_id.
export async function PATCH(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));

  // adoptIfOrphan kept as an alias so an in-flight client (a stale tab,
  // a cached JS bundle on the CDN) still gets the new, fuller behaviour.
  if (body.ensureProfile || body.adoptIfOrphan) {
    return ensureVenueProfile(auth.user!);
  }

  // General partial update (same semantics as PUT but for PATCH callers)
  try {
    // Same allowlist as PUT (E45). The ensureProfile branch above returns before
    // this point: it legitimately writes user_id and slug, so it keeps its own path.
    const { error } = await upsertVenueProfile(
      auth.user!.id,
      // The allowlist guarantees the KEYS, not the value types: these came from
      // JSON, so they are `unknown` until something validates their shape. That
      // is 06 A3's zod schema (and E46a's numeric bounds), not this cast. The
      // cast states the current position honestly rather than implying the values
      // have been checked.
      pickWritable(body, VENUE_PROFILE_WRITABLE) as Parameters<typeof upsertVenueProfile>[1],
    );
    if (error) {
      console.error("Venue profile patch error:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// Self-heal flow for venue_profiles. Tries, in order:
//   1. Row keyed to user_id → already linked, return.
//   2. Orphan (user_id IS NULL) with the slug carried in user_metadata
//      → adopt. This is the registration-time orphan we know about.
//   3. Orphan with a matching email (case-insensitive, most recent if
//      duplicates) → adopt. Backstop for older orphans where the
//      metadata slug doesn't match (admin edits, re-registration).
//   4. INSERT a new minimal row using metadata. Suffix the slug on
//      unique-violation so a collision can't permanently lock a user
//      out (they can rename later via the portal).
async function ensureVenueProfile(user: User) {
  const db = getSupabaseAdmin();
  const userId = user.id;
  const userEmail = (user.email || "").trim();
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const metaSlug = typeof meta.venue_slug === "string" ? meta.venue_slug : "";
  const metaName = typeof meta.display_name === "string" ? meta.display_name : "";

  // 1. Already linked
  const { data: linked } = await db
    .from("venue_profiles")
    .select("id, slug")
    .eq("user_id", userId)
    .maybeSingle();
  if (linked) {
    return NextResponse.json({ ok: true, status: "already_linked", slug: linked.slug });
  }

  // 2. Adopt orphan by slug from metadata
  if (metaSlug) {
    const { data: bySlug } = await db
      .from("venue_profiles")
      .select("id, slug")
      .eq("slug", metaSlug)
      .is("user_id", null)
      .maybeSingle();
    if (bySlug) {
      const { error } = await db
        .from("venue_profiles")
        .update({ user_id: userId })
        .eq("id", bySlug.id);
      if (!error) {
        return NextResponse.json({ ok: true, status: "adopted_by_slug", slug: bySlug.slug });
      }
      console.error("[ensureVenueProfile] adopt-by-slug update failed:", error);
    }
  }

  // 3. Adopt orphan by email (case-insensitive, most recent)
  if (userEmail) {
    const { data: byEmail } = await db
      .from("venue_profiles")
      .select("id, slug, created_at")
      .ilike("email", userEmail)
      .is("user_id", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (byEmail && byEmail.length > 0) {
      const target = byEmail[0];
      const { error } = await db
        .from("venue_profiles")
        .update({ user_id: userId })
        .eq("id", target.id);
      if (!error) {
        return NextResponse.json({ ok: true, status: "adopted_by_email", slug: target.slug });
      }
      console.error("[ensureVenueProfile] adopt-by-email update failed:", error);
    }
  }

  // 4. Insert from metadata. Suffix slug on collision.
  const baseSlug = metaSlug || slugify(metaName) || `venue-${userId.slice(0, 8)}`;
  let slug = baseSlug;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const insertSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    slug = insertSlug;
    const { error } = await db.from("venue_profiles").insert({
      user_id: userId,
      slug: insertSlug,
      name: metaName || "My venue",
      email: userEmail,
      contact_name: metaName || "",
    });
    if (!error) {
      return NextResponse.json({ ok: true, status: "created", slug: insertSlug });
    }
    // Postgres unique_violation
    if (error.code !== "23505") {
      console.error("[ensureVenueProfile] insert failed:", error);
      return NextResponse.json(
        { ok: false, status: "insert_failed", message: error.message },
        { status: 500 },
      );
    }
  }
  console.error("[ensureVenueProfile] slug suffix exhausted for", baseSlug);
  return NextResponse.json({ ok: false, status: "slug_exhausted", slug }, { status: 500 });
}

// POST: create initial venue profile
export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { name, slug, type, location, contactName, email, phone, wallSpace } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    const { error } = await upsertVenueProfile(auth.user!.id, {
      slug,
      name,
      type: type || "",
      location: location || "",
      contact_name: contactName || "",
      email: email || "",
      phone: phone || "",
      wall_space: wallSpace || "",
    });

    if (error) {
      console.error("Venue profile creation error:", error);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
