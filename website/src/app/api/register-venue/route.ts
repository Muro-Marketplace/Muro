import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      venueName, venueType, contactName, email, phone,
      addressLine1, addressLine2, city, postcode,
      wallSpace, artInterests, message, hearAbout,
    } = body;

    if (!venueName || !venueType || !contactName || !email || !addressLine1 || !city || !postcode) {
      return NextResponse.json(
        { error: "Please fill in all required fields" },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("venue_registrations").insert({
      venue_name: venueName,
      venue_type: venueType,
      contact_name: contactName,
      email,
      phone: phone || null,
      address_line1: addressLine1,
      address_line2: addressLine2 || null,
      city,
      postcode,
      wall_space: wallSpace || null,
      art_interests: artInterests || [],
      message: message || null,
      hear_about: hearAbout || null,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A registration with this email already exists" },
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
