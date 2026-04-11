import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { applySchema } from "@/lib/validations";
import { notifyAdminNewApplication, confirmApplicationToArtist } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = applySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please fill in all required fields" },
        { status: 400 }
      );
    }

    const d = parsed.data;

    const { error } = await supabase.from("artist_applications").insert({
      name: d.name,
      email: d.email,
      location: d.location,
      instagram: d.instagram || null,
      website: d.website || null,
      primary_medium: d.primaryMedium,
      portfolio_link: d.portfolioLink,
      artist_statement: d.artistStatement,
      offers_originals: d.offersOriginals || false,
      offers_prints: d.offersPrints || false,
      offers_framed: d.offersFramed || false,
      offers_commissions: d.offersCommissions || false,
      open_to_free_loan: d.openToFreeLoan || false,
      open_to_revenue_share: d.openToRevenueShare || false,
      open_to_purchase: d.openToPurchase || false,
      delivery_radius: d.deliveryRadius || null,
      venue_types: d.venueTypes || [],
      themes: d.themes || [],
      hear_about: d.hearAbout || null,
      selected_plan: d.selectedPlan || "core",
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "An application with this email already exists" },
          { status: 409 }
        );
      }
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    // Fire-and-forget email notifications
    notifyAdminNewApplication({ name: d.name, email: d.email, location: d.location, primaryMedium: d.primaryMedium });
    confirmApplicationToArtist({ name: d.name, email: d.email });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
