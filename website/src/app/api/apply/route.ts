import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { applySchema } from "@/lib/validations";
import { notifyAdminNewApplication } from "@/lib/email";
import { sendEmail } from "@/lib/email/send";
import { ArtistApplicationSubmitted } from "@/emails/templates/artist-additions/ArtistApplicationSubmitted";
import { checkRateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slugify";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

export async function POST(request: Request) {
  const limited = await checkRateLimit(request, 5, 60000);
  if (limited) return limited;

  // /signup/artist always lands the visitor here as an authenticated user
  // (the page redirects unauthenticated visitors to signup first). Tying
  // the application to the auth user lets us also create the matching
  // artist_profiles row in lockstep, which is what allows a pending
  // applicant to log in to the artist portal and upload work for admin
  // review BEFORE the admin accepts them.
  //
  // Authentication is optional only for legacy clients; without an auth
  // user we still write the application row but skip the profile bridge,
  // and rely on the admin accept route to create the profile later.
  const auth = await getAuthenticatedUser(request);
  const authedUser = auth.error ? null : auth.user;

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
      primary_medium: d.primaryMedium || null,
      discipline: d.discipline || null,
      sub_styles: d.subStyles || [],
      // Merge `sampleWorkUrls` into `portfolio_link` until we have a
      // dedicated samples column. Existing portfolio link kept on its
      // own line, sample URLs follow on subsequent lines so admins
      // reviewing the application see everything in one place.
      portfolio_link: (() => {
        const samples = (d as { sampleWorkUrls?: string[] }).sampleWorkUrls
          ?.map((u) => u?.trim())
          .filter((u): u is string => !!u && u.length > 0);
        const main = d.portfolioLink?.trim() || "";
        if (!samples || samples.length === 0) return main;
        const sampleBlock = samples
          .map((u, i) => `Sample ${i + 1}: ${u}`)
          .join("\n");
        return main ? `${main}\n${sampleBlock}` : sampleBlock;
      })(),
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

    // Bridge to artist_profiles. Without this row the artist portal's
    // artwork upload endpoint returns 404 ("No artist profile found")
    // because it keys on artist_profiles.user_id. Creating the row at
    // application time, with review_status='pending', lets the artist
    // start uploading work for admin review immediately. The public
    // marketplace and outbound actions (placements, sales) stay gated
    // by review_status='approved' so a pending profile doesn't leak
    // onto /browse or send placement requests.
    if (authedUser) {
      try {
        const db = getSupabaseAdmin();
        const { data: existingProfile } = await db
          .from("artist_profiles")
          .select("id, review_status")
          .eq("user_id", authedUser.id)
          .maybeSingle();

        if (!existingProfile) {
          // Slug is derived from the application name. Collide-and-retry
          // with a numeric suffix because the table enforces UNIQUE(slug)
          // and the marketplace deep-links on the slug.
          const baseSlug = slugify(d.name) || "artist";
          let candidateSlug = baseSlug;
          for (let attempt = 2; attempt < 50; attempt++) {
            const { data: clash } = await db
              .from("artist_profiles")
              .select("id")
              .eq("slug", candidateSlug)
              .maybeSingle();
            if (!clash) break;
            candidateSlug = `${baseSlug}-${attempt}`;
          }

          await db.from("artist_profiles").insert({
            user_id: authedUser.id,
            slug: candidateSlug,
            name: d.name,
            location: d.location || "",
            primary_medium: d.primaryMedium || "",
            discipline: d.discipline || null,
            sub_styles: d.subStyles || [],
            short_bio: d.artistStatement?.slice(0, 200) || "",
            extended_bio: d.artistStatement || "",
            instagram: d.instagram || "",
            website: d.website || "",
            offers_originals: d.offersOriginals || false,
            offers_prints: d.offersPrints || false,
            offers_framed: d.offersFramed || false,
            open_to_free_loan: d.openToFreeLoan || false,
            open_to_revenue_share: d.openToRevenueShare || false,
            open_to_outright_purchase: d.openToPurchase || false,
            delivery_radius: d.deliveryRadius || "Greater London",
            venue_types_suited_for: d.venueTypes || [],
            themes: d.themes || [],
            style_tags: [],
            available_sizes: [],
            review_status: "pending",
          });
        }
      } catch (profileErr) {
        // Profile bridge is best-effort. The admin accept route will
        // create the profile too, so a failure here doesn't strand the
        // applicant; it only delays their ability to upload pre-review.
        console.error("Profile bridge insert failed:", profileErr);
      }
    }

    // Admin ping, keep the legacy helper, it's internal only.
    // primaryMedium is optional now; fall back to a placeholder so
    // the admin notification helper's required-string contract holds.
    notifyAdminNewApplication({ name: d.name, email: d.email, location: d.location, primaryMedium: d.primaryMedium || "-" });

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
