import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { registerVenueSchema } from "@/lib/validations";
import { checkRateLimit } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/after-response";
import { sendEmail } from "@/lib/email/send";
import { VenueRegistrationConfirmation } from "@/emails/templates/venue-lifecycle/VenueRegistrationConfirmation";
import { sendAdminAlert } from "@/lib/email/admin-alert";

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

    // A43: the "Other" venue type comes with a free-text description that
    // used to be stripped by the schema and silently discarded. There is no
    // venue_registrations column for it, so fold it into the stored message
    // instead of migrating; the venue's typed input has to land somewhere.
    const customVenueType =
      d.venueType === "Other" ? (d.customVenueType || "").trim() : "";
    const message = [
      customVenueType ? `Venue type: ${customVenueType}.` : "",
      (d.message || "").trim(),
    ]
      .filter(Boolean)
      .join("\n\n");

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
      message: message || null,
      hear_about: d.hearAbout || null,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    // E36d. A duplicate used to answer 409 "A registration with this email
    // already exists", turning a public unauthenticated form into an
    // account-existence oracle. Byte-identical output to a fresh registration
    // now; the signal moves to a server log line, which is where it belonged.
    const alreadyRegistered = error?.code === "23505";
    if (alreadyRegistered) {
      console.warn("[register-venue] duplicate registration for an existing email");
    } else if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    // E34. This used to seed an ownerless venue_profiles row here, on a slug
    // taken from the RAW body (`body.venueSlug`, absent from registerVenueSchema,
    // so unvalidated and never slugified) — letting an anonymous caller squat any
    // slug and manufacture the orphan that venue-profile's adopt-by-slug branch
    // would then hand to whoever claimed it.
    //
    // The seed could never work in any case: venue_profiles.user_id is NOT NULL
    // and the insert omitted it, so every registration hit a 23502 that was
    // logged and swallowed. Prod confirms it — 9 venues, 0 ownerless rows.
    //
    // The profile is now created on the venue's first verified login by
    // ensureVenueProfile, hydrated from this venue_registrations row via the
    // confirmed email. Registration details still reach the profile; ownership
    // comes from a verified fact instead of a string a stranger chose.

    // E36d. Both sends move off the response path. Awaiting them here made the
    // fresh branch measurably slower than the duplicate one, so identical
    // status codes would still have leaked through latency.
    if (!alreadyRegistered) {
      afterResponse(async () => {
        // K1: was notifyAdminNewVenue in the legacy module.
        await sendAdminAlert({
          idempotencyKey: `admin_new_venue:${d.email.toLowerCase()}`,
          subject: `New venue registration: ${d.venueName}`,
          summary: `${d.venueName} registered through the public form.`,
          fields: [
            { label: "Contact", value: `${d.contactName} <${d.email}>` },
            {
              label: "Type",
              value: customVenueType ? `Other (${customVenueType})` : d.venueType,
            },
            { label: "Location", value: `${d.city}, ${d.postcode}` },
          ],
        });

        await sendEmail({
          idempotencyKey: `venue_registration_confirmation:${d.email.toLowerCase()}`,
          template: "venue_registration_confirmation",
          category: "security",
          to: d.email,
          subject: "Your venue is registered on Wallplace",
          react: VenueRegistrationConfirmation({
            contactFirstName: (d.contactName || "there").split(" ")[0],
            venueName: d.venueName,
          }),
          metadata: { venueType: d.venueType, location: `${d.city}, ${d.postcode}` },
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
