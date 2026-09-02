import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { handleAuthzError } from "@/lib/authz";
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
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[venue-profile] unhandled error", err);
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
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[venue-profile] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// Self-heal flow for venue_profiles. Tries, in order:
//   1. Row keyed to user_id → already linked, return.
//   2. Exactly one orphan (user_id IS NULL) whose email matches the caller's
//      CONFIRMED address → adopt.
//   3. INSERT a new row, hydrated from the caller's own venue_registrations
//      entry when their confirmed email matches one. Suffix the slug on
//      unique-violation so a collision can't permanently lock a user out
//      (they can rename later via the portal).
//
// E34. There used to be a step between 1 and 2 that adopted any orphan whose
// slug matched `user_metadata.venue_slug`, and step 3 used the same string as
// the new row's slug. That string is written by the browser with the public
// anon key at signup (`signup/venue/page.tsx`), so it is chosen by the
// claimant and evidences nothing. Adopting on it handed over the public
// /venues/<slug> page, the inbound routing for artist messages, placements and
// artwork requests, and the registration PII on the row; using it as the insert
// slug let a signup pre-claim the canonical handle of a venue that had not
// registered yet. Ownership now follows only facts the server verified: the
// user id and a CONFIRMED email, both off the JWT.
//
// Any venue this strands (registered under one address, signed up under
// another) is an admin "link to user" action, audited — the correct cost for an
// operation that transfers ownership.
async function ensureVenueProfile(user: User) {
  const db = getSupabaseAdmin();
  const userId = user.id;
  const userEmail = (user.email || "").trim();
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const metaName = typeof meta.display_name === "string" ? meta.display_name : "";
  // An unconfirmed address proves nothing: anyone can type someone else's into
  // a signup form. Confirmation is what turns it into evidence.
  const emailVerified = userEmail !== "" && Boolean(user.email_confirmed_at);

  // 1. Already linked
  const { data: linked } = await db
    .from("venue_profiles")
    .select("id, slug")
    .eq("user_id", userId)
    .maybeSingle();
  if (linked) {
    return NextResponse.json({ ok: true, status: "already_linked", slug: linked.slug });
  }

  // 2. Adopt an orphan by confirmed email, and only when exactly one matches.
  // Taking the newest of several was a coin flip on a shared or role address,
  // which is not a basis for transferring ownership.
  if (emailVerified) {
    const { data: byEmail } = await db
      .from("venue_profiles")
      .select("id, slug")
      .ilike("email", userEmail)
      .is("user_id", null)
      .limit(2);
    if (byEmail && byEmail.length === 1) {
      const target = byEmail[0];
      const { error } = await db
        .from("venue_profiles")
        .update({ user_id: userId })
        .eq("id", target.id);
      if (!error) {
        return NextResponse.json({ ok: true, status: "adopted_by_email", slug: target.slug });
      }
      console.error("[ensureVenueProfile] adopt-by-email update failed:", error);
    } else if (byEmail && byEmail.length > 1) {
      console.error(
        "[ensureVenueProfile] refusing to adopt: multiple orphans share this email; needs an admin link",
      );
    }
  }

  // 3. Insert. Hydrate from the caller's own registration where the confirmed
  // email matches one, so the details they already typed reach the profile.
  // register-venue used to seed an ownerless row for this; it could never
  // succeed (venue_profiles.user_id is NOT NULL) and an ownerless row is
  // exactly what the takeover above targeted.
  const registration = emailVerified ? await findVenueRegistration(db, userEmail) : null;
  const baseSlug =
    slugify(registration?.venue_name || metaName) || `venue-${userId.slice(0, 8)}`;
  let slug = baseSlug;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const insertSlug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    slug = insertSlug;
    const { error } = await db.from("venue_profiles").insert({
      user_id: userId,
      slug: insertSlug,
      name: registration?.venue_name || metaName || "My venue",
      email: userEmail,
      contact_name: registration?.contact_name || metaName || "",
      type: registration?.venue_type || "",
      location: registration?.city || "",
      phone: registration?.phone || "",
      wall_space: registration?.wall_space || "",
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

type VenueRegistration = {
  venue_name: string | null;
  venue_type: string | null;
  contact_name: string | null;
  phone: string | null;
  city: string | null;
  wall_space: string | null;
};

/** The caller's own registration, matched on their confirmed email. */
async function findVenueRegistration(
  db: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<VenueRegistration | null> {
  const { data, error } = await db
    .from("venue_registrations")
    .select("venue_name, venue_type, contact_name, phone, city, wall_space")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[ensureVenueProfile] registration lookup failed:", error);
    return null;
  }
  return (data?.[0] as VenueRegistration | undefined) ?? null;
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
    }, {
      // Creation-time only: the slug is chosen by this route.
      allowServerOwned: ["slug"],
    })

    if (error) {
      console.error("Venue profile creation error:", error);
      return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    // 01 §1.3, Phase E item 14. This was a bare `catch {}` answering 400 for
    // everything: an AuthzError that means 403 or 404, a schema failure, and a
    // genuine server fault were indistinguishable to the caller AND to us. The
    // authz status is preserved first, then the fault is logged, so a real bug
    // stops looking like a malformed body.
    const denied = handleAuthzError(err);
    if (denied) return denied;
    console.error("[venue-profile] unhandled error", err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
