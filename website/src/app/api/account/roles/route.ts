import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findAllUsersByEmail } from "@/lib/auth/find-user-by-email";

// Returns the set of distinct user_metadata.user_type values across all
// auth.users rows that share this user's email. Used to render a "Switch
// portal" sub-menu when the same email has both an artist + a customer
// account.
//
// We never expose the *user_ids* of other accounts, only the role labels.
//
// The comment here used to say "admin.listUsers() paginates at 1000/page".
// It does not: the default is 50, and this called it with no arguments. So the
// switch-portal menu was going to start silently disappearing for anyone whose
// other account landed past user 50. findAllUsersByEmail pages properly.
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const email = auth.user!.email;
  if (!email) return NextResponse.json({ roles: [] });

  try {
    const db = getSupabaseAdmin();
    const same = await findAllUsersByEmail(db, email);
    const roles = Array.from(
      new Set(
        same
          .map((u) => u.user_metadata?.user_type)
          .filter((r): r is string => typeof r === "string"),
      ),
    );
    return NextResponse.json({ roles });
  } catch {
    // If admin lookup fails for any reason, surface as no extra roles
    // rather than 500ing the header dropdown.
    return NextResponse.json({ roles: [] });
  }
}
