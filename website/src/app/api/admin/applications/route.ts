import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  try {
    let query = getSupabaseAdmin()
      .from("artist_applications")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error: dbError } = await query;

    if (dbError) throw dbError;

    return NextResponse.json({ applications: data || [] });
  } catch (err) {
    console.error("Admin applications error:", err);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}
