import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const db = getSupabaseAdmin();
    const [apps, artists, venues] = await Promise.all([
      db.from("artist_applications").select("status"),
      db.from("artist_profiles").select("id"),
      db.from("venue_profiles").select("id"),
    ]);

    const applications = apps.data || [];
    const pending = applications.filter((a) => a.status === "pending").length;
    const accepted = applications.filter((a) => a.status === "accepted").length;
    const rejected = applications.filter((a) => a.status === "rejected").length;

    return NextResponse.json({
      applications: { total: applications.length, pending, accepted, rejected },
      artists: artists.data?.length || 0,
      venues: venues.data?.length || 0,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
