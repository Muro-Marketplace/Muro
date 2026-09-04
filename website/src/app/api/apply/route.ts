import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { applySchema } from "@/lib/validations";
import { buildArtistApplicationRow } from "@/lib/artist-application-row";
import { sendEmail } from "@/lib/email/send";
import { ArtistApplicationSubmitted } from "@/emails/templates/artist-additions/ArtistApplicationSubmitted";
import { checkRateLimit } from "@/lib/rate-limit";
import { afterResponse } from "@/lib/after-response";
import { chooseArtistSlug } from "@/lib/artist-slug";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { triggerWelcomeIfNeeded } from "@/lib/email/welcome";

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

    // A50 (QA 2026-08-28): the whole point of auth-gating the application is
    // to reject impersonation instead of trusting whatever email the form
    // sent, and this route never actually checked. A signed-in user could
    // file an application, and trigger the acknowledgement email, for any
    // address they liked. When we know who the caller is, the application
    // email must be their own; the legacy unauthenticated path is unchanged.
    if (authedUser?.email && d.email.toLowerCase() !== authedUser.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: `Please apply with the email on your account (${authedUser.email}). To use a different address, sign out first.`,
        },
        { status: 403 },
      );
    }

    // ONE insert, no strip-and-retry. Every column below exists in production
    // (checked against `tests/integration/schema-columns.json` and against the
    // live schema), so the ladder that used to sit under this could not do what
    // it claimed. What it actually did was worse than nothing: see migration 109.
    // A L514 (production pass, 2026-08-30): submitting with the optional
    // fields blank answered 500. `primary_medium` was written as an explicit
    // null and `artist_statement` as undefined, which JSON serialisation drops
    // so the column never reached the INSERT. Both are NOT NULL with no
    // default. Row building now lives in one tested place, see
    // `lib/artist-application-row.ts` for why "" is the right coercion.
    // Row G L2366. Resolve the claimed referral code against the codes that
    // actually exist before it is stored. A code the applicant mistyped is
    // worth losing; a code that looks credited and is not is worse than none,
    // and `artist_referrals` held 0 rows across all of production because
    // nothing downstream ever re-checked it.
    const claimedCode = d.referralCode?.trim().toUpperCase() || "";
    let referredByCode: string | null = null;
    if (claimedCode) {
      const { data: referrer } = await getSupabaseAdmin()
        .from("artist_profiles")
        .select("referral_code")
        .eq("referral_code", claimedCode)
        .maybeSingle();
      referredByCode = referrer ? claimedCode : null;
      if (!referrer) {
        console.warn("[apply] referral code does not belong to any artist, dropped");
      }
    }

    const fullRow = buildArtistApplicationRow(d, { referredByCode });

    // X3 / 074. Was the anon client. Migration 074 drops both
    // `WITH CHECK (true)` INSERT policies on artist_applications, so an anon
    // insert now fails RLS: this switch and that migration MUST ship together
    // (D15.4), or public applications break silently. The route is the only
    // legitimate writer, it validates through applySchema and is rate-limited
    // above, so the service-role client is the right level of trust here.
    const applyDb = getSupabaseAdmin();
    // The strip-and-retry that used to sit here listed six columns to drop "if
    // the schema lags". Five of them exist. The sixth, `referred_by_code`, did
    // NOT, and never had: migration 019 added it to `artist_profiles` only.
    //
    // So the first insert failed on EVERY application, referred or not, because
    // `referred_by_code: null` still names the column. The retry dropped it and
    // re-inserted, the application saved, and the referral code was destroyed.
    // Measured against prod: 13 applications, 7 artists holding a code to share,
    // 0 profiles recording who referred them. The entire referral programme has
    // never worked, and this loop is why nobody found out.
    //
    // Migration 109 adds the column. One insert now, and a real failure surfaces
    // as a 500 instead of becoming a quieter, lossier write.
    const { error: insertError } = await applyDb.from("artist_applications").insert(fullRow);

    // E36d. A duplicate email used to answer 409 with "An application with this
    // email already exists", which turns a public unauthenticated form into an
    // account-existence oracle: submit an address, read the status, learn
    // whether that person has applied. It now returns byte-identical output to
    // a fresh submission. The repeat submitter sees the success screen, which
    // is the right trade for a public form; if we ever need to tell them, tell
    // them by email, which only reaches someone who controls the address.
    // The duplicate still gets a server log line, which is where the signal
    // belonged.
    const alreadyApplied = insertError?.code === "23505";
    if (alreadyApplied) {
      console.warn("[apply] duplicate application for an existing email");
    }
    if (insertError && !alreadyApplied) {
      console.error("Supabase error:", insertError);
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
    // The bridge runs for every authenticated applicant, duplicate or not: it
    // is idempotent (existingProfile check below), and an applicant whose
    // first submission carried no session has an application but no profile
    // row, which bounces them off the portal until this creates it.
    if (authedUser) {
      try {
        const db = getSupabaseAdmin();
        const { data: existingProfile } = await db
          .from("artist_profiles")
          .select("id, review_status")
          .eq("user_id", authedUser.id)
          .maybeSingle();

        if (!existingProfile) {
          // The slug is the artist's public URL: /browse/{slug}, and since the
          // vanity route also /{slug}. So it has to be unique against the
          // table AND must not be a top-level route name. chooseArtistSlug
          // owns both rules and the collide-and-retry, shared with the OAuth
          // and claim signup paths which each used to do this differently.
          const candidateSlug = await chooseArtistSlug(d.name, async (slug) => {
            const { data: clash } = await db
              .from("artist_profiles")
              .select("id")
              .eq("slug", slug)
              .maybeSingle();
            return clash !== null;
          });

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

    // E36d. Both sends move off the response path. Awaiting them here is what
    // made the duplicate branch measurably faster than the fresh one, so the
    // status fix above would have leaked through latency instead. Skipped
    // entirely on a duplicate: the applicant already has their receipt (the
    // idempotency key would suppress it anyway) and the admin already has
    // their ping.
    if (!alreadyApplied) {
      afterResponse(async () => {
        // Admin ping, keep the legacy helper, it's internal only.
        // primaryMedium is optional now; fall back to a placeholder so
        // the admin notification helper's required-string contract holds.
        // K1: was notifyAdminNewApplication in the legacy module. Through the
        // pipeline it gets an email_events row and an idempotency key, so a
        // retried submission no longer pings the admin twice.
        // R4.15: keyed on the bare email, this burnt forever, so a rejected
        // artist re-applying (their old row deleted) pinged nobody. The
        // submission's created_at scopes the key to THIS application; the
        // unique email constraint already stops double-submits reaching here.
        await sendAdminAlert({
          idempotencyKey: `admin_new_application:${d.email.toLowerCase()}:${fullRow.created_at}`,
          subject: `New artist application: ${d.name}`,
          summary: `${d.name} has applied to join Wallplace.`,
          fields: [
            { label: "Email", value: d.email },
            { label: "Location", value: d.location },
            { label: "Medium", value: d.primaryMedium || "-" },
          ],
          actionPath: "/admin",
          actionLabel: "Review in the admin dashboard",
        });

        // Applicant receipt via the new pipeline (polished template, logged,
        // preference-aware). R4.15: keyed per submission (email + the row's
        // created_at), not per address, so a legitimate re-application after a
        // rejection gets its receipt. Double-submits never reach this block:
        // the duplicate insert 23505s and alreadyApplied skips both sends.
        await sendEmail({
          idempotencyKey: `artist_application_submitted:${d.email.toLowerCase()}:${fullRow.created_at}`,
          template: "artist_application_submitted",
          category: "placements",
          to: d.email,
          subject: "We've received your Wallplace application",
          react: ArtistApplicationSubmitted({
            firstName: (d.name || "there").split(" ")[0],
            portfolioUrl: `${SITE}/artist-portal/portfolio`,
          }),
          metadata: { email: d.email, location: d.location },
        });

        // Owner-reported 2 September: no "account created" email arrived.
        // The welcome checklist only fires from AuthContext on SIGNED_IN,
        // which for a first-time applicant happens before the
        // artist_profiles row exists, so triggerWelcomeIfNeeded answered
        // "no profile yet" and nothing retried. The row exists now (bridge
        // above), so trigger it here; it is idempotent on welcomed_at.
        if (authedUser) {
          try {
            await triggerWelcomeIfNeeded(authedUser.id);
          } catch (welcomeErr) {
            console.error("Welcome email after application failed:", welcomeErr);
          }
        }
      });
    }

    // A duplicate skips the receipt and the admin ping, but a signed-in
    // applicant still gets the welcome if they never had it (idempotent).
    if (alreadyApplied && authedUser) {
      const userId = authedUser.id;
      afterResponse(async () => {
        try {
          await triggerWelcomeIfNeeded(userId);
        } catch (welcomeErr) {
          console.error("Welcome email after duplicate application failed:", welcomeErr);
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
