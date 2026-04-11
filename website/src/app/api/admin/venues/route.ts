import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const { data, error: dbError } = await getSupabaseAdmin()
      .from("venue_profiles")
      .select("id, user_id, slug, name, type, location, contact_name, created_at")
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    return NextResponse.json({ venues: data || [] });
  } catch (err) {
    console.error("Admin venues error:", err);
    return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
  }
}
