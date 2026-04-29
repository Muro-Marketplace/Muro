import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

// Admin emails are sourced only from env. Accepts either ADMIN_EMAILS
// (comma-separated) or ADMIN_EMAIL (single). No hardcoded default, so a
// misconfigured production deploy fails closed instead of granting the
// author's personal account admin rights.
function adminEmails(): string[] {
  const list = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return list.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Validate the request is from the admin user.
 * Returns the user or a 401/403 error response.
 */
export async function getAdminUser(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }),
    };
  }

  const allowed = adminEmails();
  if (allowed.length === 0) {
    console.error("ADMIN_EMAILS/ADMIN_EMAIL is not configured, admin access is disabled");
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access not configured" }, { status: 503 }),
    };
  }

  if (!user.email || !allowed.includes(user.email.toLowerCase())) {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return { user, error: null };
}
