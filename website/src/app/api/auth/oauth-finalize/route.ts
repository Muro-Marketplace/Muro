// POST /api/auth/oauth-finalize
//
// Called by /auth/callback after a successful OAuth sign-in (Google / Apple)
// to finish the bits Supabase doesn't do for us:
//
//   1. Stamp `user_metadata.user_type` so the rest of the app can tell which
//      portal the user belongs in. The role is taken from the URL on the
//      signup page — we trust it the first time only. If the user already
//      has a role set, we never overwrite it (so a returning artist who
//      signs in via the customer flow doesn't get demoted).
//
//   2. For new artists, create an `artist_profiles` stub with a unique slug
//      and `review_status = "pending"`. Without this, an artist who signs
//      up via Google but bounces from /apply would have an auth user with
//      no profile — invisible to the rest of the app.
//
// Customers don't need a profile row.
// Venues don't sign up via this OAuth flow yet (they use /register-venue).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { triggerWelcomeIfNeeded } from "@/lib/email/welcome";

const ALLOWED_ROLES = ["artist", "customer", "venue"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: { role?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* fall through with empty body */
  }
  const requestedRole = body.role;
  if (!requestedRole || !ALLOWED_ROLES.includes(requestedRole as Role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: userResp, error: userError } = await db.auth.getUser(token);
  const user = userResp?.user;
  if (userError || !user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // OAuth providers ship name fields under different keys; check the common ones.
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const pickName = (): string => {
    const candidates = [meta.full_name, meta.name, meta.display_name, meta.given_name];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
    return user.email?.split("@")[0] || "Artist";
  };

  // Step 1: stamp user_type if missing. Never demote.
  const currentRole = typeof meta.user_type === "string" ? (meta.user_type as Role) : null;
  if (!currentRole) {
    const displayName = (typeof meta.display_name === "string" && meta.display_name) || pickName();
    await db.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...meta,
        user_type: requestedRole,
        display_name: displayName,
      },
    });
  }

  const finalRole: Role = currentRole || (requestedRole as Role);

  // Step 2: artist profile stub for new artists.
  if (finalRole === "artist") {
    const { data: existing } = await db
      .from("artist_profiles")
      .select("id, slug")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      const name = pickName();
      const baseSlug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "artist";

      // Find a free slug. Cap iterations so a pathological clash can't loop forever.
      let slug = baseSlug;
      for (let i = 1; i < 100; i++) {
        const { data: clash } = await db
          .from("artist_profiles")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${baseSlug}-${i + 1}`;
      }

      const { error: insertError } = await db.from("artist_profiles").insert({
        user_id: user.id,
        slug,
        name,
        review_status: "pending",
      });
      if (insertError) {
        // Profile creation is best-effort here. The user can still hit /apply
        // and the form there will create one. Log and move on.
        console.error("[oauth-finalize] artist profile insert failed:", insertError);
      }
    }
  }

  // Step 3: fire welcome email (idempotent — safe to retry).
  // We do this here rather than the client because we need server-side
  // access to artist/venue profile state to compute the checklist, and
  // we already have an authenticated admin client in scope.
  try {
    await triggerWelcomeIfNeeded(user.id);
  } catch (err) {
    // Non-fatal: the user is signed in. Welcome can be re-attempted by
    // AuthContext on the next SIGNED_IN event.
    console.error("[oauth-finalize] welcome trigger failed:", err);
  }

  return NextResponse.json({ ok: true, role: finalRole });
}
