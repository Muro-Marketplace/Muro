import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { applySchema } from "@/lib/validations";
import { notifyAdminNewApplication } from "@/lib/email";
import { sendEmail } from "@/lib/email/send";
import { ArtistApplicationSubmitted } from "@/emails/templates/artist-additions/ArtistApplicationSubmitted";
import { checkRateLimit } from "@/lib/rate-limit";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, 5, 60000);
  if (limited) return limited;
  try {
    const body = await request.json();
    const parsed = applySchema.safeParse(body);

    if (!parsed.success) {
      // Map zod issues into a { field: message } object so the form can
      // surface inline errors next to the offending input rather than a
      // single generic banner. Top-level field name only; nested paths
      // are joined with "." (e.g. "subStyles.0").
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_root";
        if (!fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      const missing = Object.keys(fieldErrors);
      return NextResponse.json(
        {
          error: missing.length === 1
            ? `Please check the ${missing[0]} field.`
            : `Please check ${missing.length} fields: ${missing.join(", ")}.`,
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const d = parsed.data;

    // Build the row up-front so we can retry-without-new-columns if the
    // schema lags. Drops trader_status / business_name / vat_number on
    // the retry path so older envs still accept the application.
    const fullRow: Record<string, unknown> = {
      name: d.name,
      email: d.email,
      location: d.location,
      instagram: d.instagram || null,
      website: d.website || null,
      primary_medium: d.primaryMedium,
      discipline: d.discipline || null,
      sub_styles: d.subStyles || [],
      portfolio_link: d.portfolioLink,
      artist_statement: d.artistStatement,
      trader_status: d.traderStatus || null,
      business_name: d.businessName || null,
      vat_number: d.vatNumber || null,
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
      referred_by_code: (d as { referralCode?: string }).referralCode
        ? ((d as { referralCode?: string }).referralCode as string).toUpperCase()
        : null,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    let { error } = await supabase.from("artist_applications").insert(fullRow);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const dropOnLegacy: string[] = [];
      if (msg.includes("trader_status")) dropOnLegacy.push("trader_status");
      if (msg.includes("business_name")) dropOnLegacy.push("business_name");
      if (msg.includes("vat_number")) dropOnLegacy.push("vat_number");
      if (msg.includes("discipline")) dropOnLegacy.push("discipline");
      if (msg.includes("sub_styles")) dropOnLegacy.push("sub_styles");
      if (msg.includes("referred_by_code")) dropOnLegacy.push("referred_by_code");
      if (dropOnLegacy.length > 0) {
        const safeRow = { ...fullRow };
        for (const k of dropOnLegacy) delete safeRow[k];
        const retry = await supabase.from("artist_applications").insert(safeRow);
        error = retry.error;
      }
    }

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

    // Admin ping — keep the legacy helper, it's internal only.
    notifyAdminNewApplication({ name: d.name, email: d.email, location: d.location, primaryMedium: d.primaryMedium });

    // Applicant receipt via the new pipeline (polished template, logged,
    // preference-aware). We key idempotency off the email address so a
    // double-submit from the form doesn't double-send.
    await sendEmail({
      idempotencyKey: `artist_application_submitted:${d.email.toLowerCase()}`,
      template: "artist_application_submitted",
      category: "placements",
      to: d.email,
      subject: "We've received your Wallplace application",
      react: ArtistApplicationSubmitted({
        firstName: (d.name || "there").split(" ")[0],
        reviewTimelineDays: 3,
        portfolioUrl: `${SITE}/artist-portal/portfolio`,
      }),
      metadata: { email: d.email, location: d.location },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
