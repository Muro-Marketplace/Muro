import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  try {
    const db = getSupabaseAdmin();
    // Pull every field that's potentially useful in the admin CRM. The
    // optional gallery / display columns might be missing on older
    // schemas, fall back to the lean select if so.
    let data: Array<Record<string, unknown>> | null = null;
    let dbError: { message?: string } | null = null;
    {
      const res = await db
        .from("venue_profiles")
        .select("id, user_id, slug, name, type, location, city, postcode, address_line1, address_line2, contact_name, email, phone, wall_space, description, image, images, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes, display_wall_space, display_lighting, display_install_notes, display_rotation_frequency, created_at")
        .order("created_at", { ascending: false });
      data = (res.data as Array<Record<string, unknown>> | null) || null;
      dbError = res.error;
    }
    if (dbError) {
      const fallback = await db
        .from("venue_profiles")
        .select("id, user_id, slug, name, type, location, contact_name, email, phone, address_line1, city, postcode, wall_space, description, image, approximate_footfall, audience_type, interested_in_free_loan, interested_in_revenue_share, interested_in_direct_purchase, preferred_styles, preferred_themes, created_at")
        .order("created_at", { ascending: false });
      data = (fallback.data as Array<Record<string, unknown>> | null) || null;
      dbError = fallback.error;
    }

    if (dbError) throw dbError;

    // Augment each venue with a quick placement count so admins can see
    // who's actively using the platform without leaving the list.
    const slugs = (data || []).map((v) => v.slug as string).filter(Boolean);
    const placementCounts: Record<string, number> = {};
    if (slugs.length > 0) {
      const { data: pData } = await db
        .from("placements")
        .select("venue_slug")
        .in("venue_slug", slugs);
      for (const p of pData || []) {
        const s = p.venue_slug as string;
        if (s) placementCounts[s] = (placementCounts[s] || 0) + 1;
      }
    }

    const venues = (data || []).map((v) => ({
      ...v,
      placement_count: placementCounts[v.slug as string] || 0,
    }));

    return NextResponse.json({ venues });
  } catch (err) {
    console.error("Admin venues error:", err);
    return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 });
  }
}
