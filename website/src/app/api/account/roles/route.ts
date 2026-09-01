import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findAllUsersByEmail } from "@/lib/auth/find-user-by-email";

// Returns the set of roles this person can reach, from two independent sources.
//
// 1. The distinct `user_metadata.user_type` values across every auth.users row
//    sharing this email. That is the DESIGNED shape: one account per role,
//    switched between by signing in as the other.
//
//    The comment here used to say "admin.listUsers() paginates at 1000/page".
//    It does not: the default is 50, and this called it with no arguments. So
//    the switch-portal menu was going to start silently disappearing for anyone
//    whose other account landed past user 50. findAllUsersByEmail pages properly.
//
// 2. The profile tables, keyed on THIS user id. Pass 2 item 3.9 (rows 2571,
//    2585): pass 1 recorded "no email holds two roles", so the switcher never
//    rendering was put down to account state. Two do, and both hold BOTH
//    profiles on ONE auth user, which has one metadata value and therefore
//    reported one role. `venue_profiles.finlay` was unreachable: nothing offered
//    it and /venue-portal redirected the account away from it.
//
//    That shape is not the designed one and nothing here creates it. But the
//    answer to an account that owns a venue profile is not to pretend it does
//    not. Profile ownership is also the STRONGER authority of the two: a user
//    can write their own `user_metadata`, and cannot write these tables.
//
// We never expose the *user_ids* of other accounts, only the role labels.
//
// `roles`    everything reachable, however they get there.
// `ownRoles` the subset this very account can enter without switching, which is
//            what the portal guards need in order to stop bouncing someone out
//            of a portal whose profile they own.
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const email = auth.user!.email;
  const userId = auth.user!.id;

  const roles = new Set<string>();
  const ownRoles = new Set<string>();

  // Source 2 first: it is the one that does not depend on GoTrue admin calls,
  // so a listUsers failure still leaves the account able to reach its own
  // portals.
  try {
    const db = getSupabaseAdmin();
    const [artist, venue, customer] = await Promise.all([
      db.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle(),
      db.from("venue_profiles").select("id").eq("user_id", userId).maybeSingle(),
      db.from("customer_profiles").select("id").eq("user_id", userId).maybeSingle(),
    ]);
    if (artist.data) ownRoles.add("artist");
    if (venue.data) ownRoles.add("venue");
    if (customer.data) ownRoles.add("customer");
    for (const r of ownRoles) roles.add(r);
  } catch {
    // Fall through to the metadata source rather than 500ing the header.
  }

  if (email) {
    try {
      const db = getSupabaseAdmin();
      const same = await findAllUsersByEmail(db, email);
      for (const u of same) {
        const r = u.user_metadata?.user_type;
        if (typeof r === "string" && r) roles.add(r);
      }
    } catch {
      // If admin lookup fails for any reason, surface the profile-derived roles
      // rather than 500ing the header dropdown.
    }
  }

  return NextResponse.json({ roles: [...roles], ownRoles: [...ownRoles] });
}
