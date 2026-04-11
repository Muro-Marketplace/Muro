import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { registerVenueSchema } from "@/lib/validations";
import { notifyAdminNewVenue } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerVenueSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please fill in all required fields" },
        { status: 400 }
      );
    }

    const d = parsed.data;

    const { error } = await supabase.from("venue_registrations").insert({
      venue_name: d.venueName,
      venue_type: d.venueType,
      contact_name: d.contactName,
      email: d.email,
      phone: d.phone || null,
      address_line1: d.addressLine1,
      address_line2: d.addressLine2 || null,
      city: d.city,
      postcode: d.postcode,
      wall_space: d.wallSpace || null,
      art_interests: d.artInterests || [],
      message: d.message || null,
      hear_about: d.hearAbout || null,
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

    notifyAdminNewVenue({
      name: d.venueName,
      contactName: d.contactName,
      email: d.email,
      type: d.venueType,
      location: `${d.city}, ${d.postcode}`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
