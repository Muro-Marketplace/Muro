import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const { data, error: dbError } = await getSupabaseAdmin()
      .from("artist_profiles")
      .select("id, user_id, slug, name, primary_medium, location, created_at")
      .order("created_at", { ascending: false });

    if (dbError) throw dbError;

    return NextResponse.json({ artists: data || [] });
  } catch (err) {
    console.error("Admin artists error:", err);
    return NextResponse.json({ error: "Failed to fetch artists" }, { status: 500 });
  }
}
