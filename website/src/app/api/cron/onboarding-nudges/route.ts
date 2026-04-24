// Vercel Cron — daily 10:00 UTC. Walks recently-created profiles and sends
// the day-2/4/7/10/14 onboarding nudge if the user hasn't completed that
// step. Idempotency keyed by (userId + template) so every step sends once.
//
// Assumptions (adjust to match your schema):
// - artist_profiles.created_at is present
// - profile-completion fields are direct columns (artist_statement,
//   profile_photo, instagram, etc.) — if you move to a completeness flag,
//   update the predicates below
// - venue_profiles has a similar shape

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendEmail } from "@/lib/email/send";
import { ArtistProfileCompletionNudge } from "@/emails/templates/onboarding/artist/ArtistProfileCompletionNudge";
import { ArtistFirstArtworkUploadNudge } from "@/emails/templates/onboarding/artist/ArtistFirstArtworkUploadNudge";
import { ArtistConnectStripeNudge } from "@/emails/templates/onboarding/artist/ArtistConnectStripeNudge";
import { ArtistPlacementPreferencesNudge } from "@/emails/templates/onboarding/artist/ArtistPlacementPreferencesNudge";
import { ArtistOnboardingGraduation } from "@/emails/templates/onboarding/artist/ArtistOnboardingGraduation";
import { ArtistOnboardingIncompleteRecap } from "@/emails/templates/onboarding/artist/ArtistOnboardingIncompleteRecap";
import { VenueSpaceDetailsNudge } from "@/emails/templates/onboarding/venue/VenueSpaceDetailsNudge";
import { VenuePhotoUploadNudge } from "@/emails/templates/onboarding/venue/VenuePhotoUploadNudge";
import { VenueArtPreferencesNudge } from "@/emails/templates/onboarding/venue/VenueArtPreferencesNudge";
import { VenueFirstPlacementCta } from "@/emails/templates/onboarding/venue/VenueFirstPlacementCta";
import { requireCronAuth, runBatch } from "../_auth";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

function daysSince(iso?: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

function inDayWindow(days: number, target: number): boolean {
  // ±12h window so a single daily run catches the right cohort.
  return days >= target && days <= target;
}

export async function GET(request: Request) {
  const unauth = requireCronAuth(request);
  if (unauth) return unauth;

  const db = getSupabaseAdmin();

  // Artists created in the last 15 days — anyone older is past the cohort.
  const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data: artists } = await db
    .from("artist_profiles")
    .select("user_id, name, slug, created_at, artist_statement, profile_photo, primary_medium, stripe_connect_account_id, venue_types_suited_for, themes")
    .gte("created_at", cutoff)
    .not("user_id", "is", null);

  const artistResult = await runBatch(artists || [], async (artist) => {
    if (!artist.user_id) return;
    const days = daysSince(artist.created_at);
    const { data: { user } } = await db.auth.admin.getUserById(artist.user_id);
    if (!user?.email) return;

    const firstName = (artist.name || "there").split(" ")[0];

    // Day 2 — profile completion
    if (inDayWindow(days, 2)) {
      const missing: string[] = [];
      if (!artist.artist_statement) missing.push("Artist statement");
      if (!artist.primary_medium) missing.push("Primary medium");
      if (!artist.profile_photo) missing.push("Profile photo");
      if (missing.length === 0) return;
      const completionPct = Math.max(30, 100 - missing.length * 15);

      await sendEmail({
        idempotencyKey: `onboarding:artist_profile_completion_nudge:${artist.user_id}`,
        template: "artist_profile_completion_nudge",
        category: "recommendations",
        to: user.email,
        subject: `Your profile is ${completionPct}% done — a few minutes finishes it`,
        userId: artist.user_id,
        react: ArtistProfileCompletionNudge({
          firstName,
          completionPct,
          missingItems: missing,
          profileUrl: `${SITE}/artist-portal/profile`,
        }),
      });
      return;
    }

    // Day 4 — first artwork upload
    if (inDayWindow(days, 4)) {
      const { count: worksCount } = await db
        .from("artist_works")
        .select("id", { count: "exact", head: true })
        .eq("artist_user_id", artist.user_id);
      if ((worksCount ?? 0) > 0) return;

      await sendEmail({
        idempotencyKey: `onboarding:artist_first_artwork_upload_nudge:${artist.user_id}`,
        template: "artist_first_artwork_upload_nudge",
        category: "recommendations",
        to: user.email,
        subject: "The first artwork is the hardest — here's how to add yours",
        userId: artist.user_id,
        react: ArtistFirstArtworkUploadNudge({
          firstName,
          uploadArtworkUrl: `${SITE}/artist-portal/portfolio`,
          exampleWorks: [],
          guideUrl: `${SITE}/blog/upload-your-first-work`,
        }),
      });
      return;
    }

    // Day 7 — Stripe Connect
    if (inDayWindow(days, 7)) {
      if (artist.stripe_connect_account_id) return;
      await sendEmail({
        idempotencyKey: `onboarding:artist_connect_stripe_nudge:${artist.user_id}`,
        template: "artist_connect_stripe_nudge",
        category: "recommendations",
        to: user.email,
        subject: "Connect Stripe so you don't miss a payout",
        userId: artist.user_id,
        react: ArtistConnectStripeNudge({
          firstName,
          connectStripeUrl: `${SITE}/artist-portal/billing`,
          payoutExplanationUrl: `${SITE}/faqs#payouts`,
        }),
      });
      return;
    }

    // Day 10 — placement preferences
    if (inDayWindow(days, 10)) {
      const hasPrefs = (artist.venue_types_suited_for?.length ?? 0) > 0 || (artist.themes?.length ?? 0) > 0;
      if (hasPrefs) return;
      await sendEmail({
        idempotencyKey: `onboarding:artist_placement_preferences_nudge:${artist.user_id}`,
        template: "artist_placement_preferences_nudge",
        category: "recommendations",
        to: user.email,
        subject: "Tell us where you'd love your work to live",
        userId: artist.user_id,
        react: ArtistPlacementPreferencesNudge({
          firstName,
          preferencesUrl: `${SITE}/artist-portal/profile#preferences`,
          exampleVenueTypes: ["Boutique cafés", "Independent cinemas", "Co-working studios", "Galleries"],
        }),
      });
      return;
    }

    // Day 14 — graduation vs recap
    if (inDayWindow(days, 14)) {
      const { count: worksCount } = await db
        .from("artist_works")
        .select("id", { count: "exact", head: true })
        .eq("artist_user_id", artist.user_id);
      const fullyOnboarded =
        !!artist.artist_statement &&
        !!artist.primary_medium &&
        !!artist.profile_photo &&
        !!artist.stripe_connect_account_id &&
        (worksCount ?? 0) > 0;

      if (fullyOnboarded) {
        await sendEmail({
          idempotencyKey: `onboarding:artist_onboarding_graduation:${artist.user_id}`,
          template: "artist_onboarding_graduation",
          category: "recommendations",
          to: user.email,
          subject: `You're live on Wallplace, ${firstName}`,
          userId: artist.user_id,
          react: ArtistOnboardingGraduation({
            firstName,
            dashboardUrl: `${SITE}/artist-portal`,
            discoverVenuesUrl: `${SITE}/spaces-looking-for-art`,
            profileUrl: `${SITE}/artist-portal/profile`,
          }),
        });
      } else {
        // Rough completion %: 5 steps, each ~20%.
        let done = 0;
        if (artist.artist_statement) done++;
        if (artist.primary_medium) done++;
        if (artist.profile_photo) done++;
        if (artist.stripe_connect_account_id) done++;
        if ((worksCount ?? 0) > 0) done++;
        const pct = done * 20;
        await sendEmail({
          idempotencyKey: `onboarding:artist_onboarding_incomplete_recap:${artist.user_id}`,
          template: "artist_onboarding_incomplete_recap",
          category: "recommendations",
          to: user.email,
          subject: `Your Wallplace setup is ${pct}% done`,
          userId: artist.user_id,
          react: ArtistOnboardingIncompleteRecap({
            firstName,
            completionPct: pct,
            remainingSteps: [
              ...(!artist.artist_statement ? [{ label: "Add your artist statement", done: false, url: `${SITE}/artist-portal/profile` }] : []),
              ...(!artist.primary_medium ? [{ label: "Choose your primary medium", done: false, url: `${SITE}/artist-portal/profile` }] : []),
              ...(!artist.profile_photo ? [{ label: "Add a profile photo", done: false, url: `${SITE}/artist-portal/profile` }] : []),
              ...(!artist.stripe_connect_account_id ? [{ label: "Connect Stripe", done: false, url: `${SITE}/artist-portal/billing` }] : []),
              ...((worksCount ?? 0) === 0 ? [{ label: "Upload your first work", done: false, url: `${SITE}/artist-portal/portfolio` }] : []),
            ],
            continueSetupUrl: `${SITE}/artist-portal`,
          }),
        });
      }
    }
  });

  // Venue onboarding — shorter sequence (day 2, 4, 7, 10).
  const { data: venues } = await db
    .from("venue_profiles")
    .select("user_id, name, slug, created_at, description, images, preferred_styles, approximate_footfall")
    .gte("created_at", cutoff)
    .not("user_id", "is", null);

  const venueResult = await runBatch(venues || [], async (venue) => {
    if (!venue.user_id) return;
    const days = daysSince(venue.created_at);
    const { data: { user } } = await db.auth.admin.getUserById(venue.user_id);
    if (!user?.email) return;
    const firstName = (venue.name || "there").split(" ")[0];

    if (inDayWindow(days, 2)) {
      const missing: string[] = [];
      if (!venue.description) missing.push("Description");
      if (!venue.approximate_footfall) missing.push("Approximate footfall");
      if (missing.length === 0) return;
      await sendEmail({
        idempotencyKey: `onboarding:venue_space_details_nudge:${venue.user_id}`,
        template: "venue_space_details_nudge",
        category: "recommendations",
        to: user.email,
        subject: `Finish ${venue.name}'s details so artists can match`,
        userId: venue.user_id,
        react: VenueSpaceDetailsNudge({
          firstName,
          venueName: venue.name || "your venue",
          missingItems: missing,
          spaceUrl: `${SITE}/venue-portal/profile`,
        }),
      });
      return;
    }

    if (inDayWindow(days, 4)) {
      if ((venue.images?.length ?? 0) > 0) return;
      await sendEmail({
        idempotencyKey: `onboarding:venue_photo_upload_nudge:${venue.user_id}`,
        template: "venue_photo_upload_nudge",
        category: "recommendations",
        to: user.email,
        subject: `Photos make ${venue.name}'s listing come alive`,
        userId: venue.user_id,
        react: VenuePhotoUploadNudge({
          firstName,
          venueName: venue.name || "your venue",
          uploadPhotosUrl: `${SITE}/venue-portal/profile#photos`,
          photoTips: [
            "Shoot in daylight — avoid mixed warm/cool lighting",
            "Show the wall as it would be lived in",
            "Include at least one wide shot for context",
          ],
        }),
      });
      return;
    }

    if (inDayWindow(days, 7)) {
      if ((venue.preferred_styles?.length ?? 0) > 0) return;
      await sendEmail({
        idempotencyKey: `onboarding:venue_art_preferences_nudge:${venue.user_id}`,
        template: "venue_art_preferences_nudge",
        category: "recommendations",
        to: user.email,
        subject: `Tell us the kind of art ${venue.name} is drawn to`,
        userId: venue.user_id,
        react: VenueArtPreferencesNudge({
          firstName,
          venueName: venue.name || "your venue",
          preferencesUrl: `${SITE}/venue-portal/profile#preferences`,
          styleExamples: ["Photography", "Abstract painting", "Landscape", "Portraiture"],
        }),
      });
      return;
    }

    if (inDayWindow(days, 10)) {
      // Only CTA if the venue has no placements yet.
      const { count } = await db
        .from("placements")
        .select("id", { count: "exact", head: true })
        .eq("venue_user_id", venue.user_id);
      if ((count ?? 0) > 0) return;
      await sendEmail({
        idempotencyKey: `onboarding:venue_first_placement_cta:${venue.user_id}`,
        template: "venue_first_placement_cta",
        category: "recommendations",
        to: user.email,
        subject: `Ready to host art at ${venue.name}?`,
        userId: venue.user_id,
        react: VenueFirstPlacementCta({
          firstName,
          venueName: venue.name || "your venue",
          browseArtistsUrl: `${SITE}/browse`,
          suggestedArtists: [],
        }),
      });
    }
  });

  return NextResponse.json({ ok: true, artist: artistResult, venue: venueResult });
}
