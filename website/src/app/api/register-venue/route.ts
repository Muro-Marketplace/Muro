import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { registerVenueSchema } from "@/lib/validations";
import { notifyAdminNewVenue } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slugify";
import { sendEmail } from "@/lib/email/send";
import { VenueRegistrationConfirmation } from "@/emails/templates/venue-lifecycle/VenueRegistrationConfirmation";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 5, 60000);
  if (limited) return limited;
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

    await notifyAdminNewVenue({
      name: d.venueName,
      contactName: d.contactName,
      email: d.email,
      type: d.venueType,
      location: `${d.city}, ${d.postcode}`,
    }).catch((err) => { if (err) console.error("notifyAdminNewVenue error:", err); });

    // Seed venue_profiles so the portal is ready on verified login.
    // user_id stays NULL until VenuePortalLayout's adoptIfOrphan effect
    // back-fills it on the first verified visit.
    const venueSlug = (typeof body.venueSlug === "string" && body.venueSlug)
      ? body.venueSlug
      : slugify(d.venueName);
    const db = getSupabaseAdmin();
    const { data: existing } = await db
      .from("venue_profiles")
      .select("id")
      .eq("slug", venueSlug)
      .maybeSingle();
    if (!existing) {
      const { error: profileErr } = await db.from("venue_profiles").insert({
        slug: venueSlug,
        name: d.venueName,
        type: d.venueType === "Other" && body.customVenueType ? body.customVenueType : d.venueType,
        location: d.city,
        contact_name: d.contactName,
        email: d.email,
        phone: d.phone || "",
        wall_space: d.wallSpace || "",
        // user_id intentionally omitted — stays NULL until back-filled
      });
      if (profileErr) {
        console.error("[register-venue] venue_profiles insert failed:", profileErr);
      }
    }

    await sendEmail({
      idempotencyKey: `venue_registration_confirmation:${d.email.toLowerCase()}`,
      template: "venue_registration_confirmation",
      category: "security",
      to: d.email,
      subject: "We've received your Wallplace application",
      react: VenueRegistrationConfirmation({
        contactFirstName: (d.contactName || "there").split(" ")[0],
        venueName: d.venueName,
      }),
      metadata: { venueType: d.venueType, location: `${d.city}, ${d.postcode}` },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
