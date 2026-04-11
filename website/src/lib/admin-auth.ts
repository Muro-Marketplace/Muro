import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "fcoles2598@gmail.com";

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

  if (user.email !== ADMIN_EMAIL) {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return { user, error: null };
}
