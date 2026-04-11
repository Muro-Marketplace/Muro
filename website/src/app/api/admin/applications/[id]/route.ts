import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { slugify } from "@/lib/slugify";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await getAdminUser(request);
  if (error) return error;

  const { id } = await params;
  const body = await request.json();
  const action = body.action as "accept" | "reject";

  if (!action || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    // Fetch the application
    const { data: app, error: fetchError } = await db
      .from("artist_applications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (app.status !== "pending") {
      return NextResponse.json(
        { error: `Application already ${app.status}` },
        { status: 400 }
      );
    }

    if (action === "reject") {
      await db
        .from("artist_applications")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", id);

      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Accept: create auth user via invite + artist profile
    const artistSlug = slugify(app.name);

    const { data: inviteData, error: inviteError } =
      await db.auth.admin.inviteUserByEmail(app.email, {
        data: {
          user_type: "artist",
          display_name: app.name,
          artist_slug: artistSlug,
        },
      });

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return NextResponse.json(
        { error: `Failed to invite user: ${inviteError.message}` },
        { status: 500 }
      );
    }

    const userId = inviteData.user.id;

    // Create artist profile
    const { error: profileError } = await db
      .from("artist_profiles")
      .insert({
        user_id: userId,
        slug: artistSlug,
        name: app.name,
        location: app.location || "",
        primary_medium: app.primary_medium || "",
        short_bio: app.artist_statement?.slice(0, 200) || "",
        extended_bio: app.artist_statement || "",
        instagram: app.instagram || "",
        website: app.website || "",
        offers_originals: app.offers_originals || false,
        offers_prints: app.offers_prints || false,
        offers_framed: app.offers_framed || false,
        open_to_free_loan: app.open_to_free_loan || false,
        open_to_revenue_share: app.open_to_revenue_share || false,
        open_to_outright_purchase: app.open_to_purchase || false,
        delivery_radius: app.delivery_radius || "Greater London",
        venue_types_suited_for: app.venue_types || [],
        themes: app.themes || [],
        style_tags: [],
        available_sizes: [],
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Don't fail the whole operation — user is created, profile can be fixed
    }

    // Mark application as accepted
    await db
      .from("artist_applications")
      .update({ status: "accepted", reviewed_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({
      success: true,
      status: "accepted",
      message: `Invite email sent to ${app.email}`,
    });
  } catch (err) {
    console.error("Accept/reject error:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}
