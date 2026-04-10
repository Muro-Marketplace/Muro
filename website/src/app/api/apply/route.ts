import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name, email, location, instagram, website,
      primaryMedium, portfolioLink, artistStatement,
      offersOriginals, offersPrints, offersFramed, offersCommissions,
      openToFreeLoan, openToRevenueShare, openToPurchase,
      deliveryRadius, venueTypes, themes, hearAbout, selectedPlan,
    } = body;

    if (!name || !email || !location || !primaryMedium || !portfolioLink || !artistStatement) {
      return NextResponse.json(
        { error: "Please fill in all required fields" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("artist_applications").insert({
      name,
      email,
      location,
      instagram: instagram || null,
      website: website || null,
      primary_medium: primaryMedium,
      portfolio_link: portfolioLink,
      artist_statement: artistStatement,
      offers_originals: offersOriginals || false,
      offers_prints: offersPrints || false,
      offers_framed: offersFramed || false,
      offers_commissions: offersCommissions || false,
      open_to_free_loan: openToFreeLoan || false,
      open_to_revenue_share: openToRevenueShare || false,
      open_to_purchase: openToPurchase || false,
      delivery_radius: deliveryRadius || null,
      venue_types: venueTypes || [],
      themes: themes || [],
      hear_about: hearAbout || null,
      selected_plan: selectedPlan || "core",
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

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
