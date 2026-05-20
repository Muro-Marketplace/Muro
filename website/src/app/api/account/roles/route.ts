import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Returns the set of distinct user_metadata.user_type values across all
// auth.users rows that share this user's email. Used to render a "Switch
// portal" sub-menu when the same email has both an artist + a customer
// account.
//
// We never expose the *user_ids* of other accounts, only the role labels.
// Listing all users is acceptable while the user base is small (Supabase
// admin.listUsers() paginates at 1000/page); for a larger base, replace
// with a parameterised query against auth.users.
export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const email = auth.user!.email;
  if (!email) return NextResponse.json({ roles: [] });

  try {
    const db = getSupabaseAdmin();
    const { data: matches } = await db.auth.admin.listUsers();
    const lc = email.toLowerCase();
    const same = (matches?.users || []).filter(
      (u) => u.email?.toLowerCase() === lc,
    );
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
