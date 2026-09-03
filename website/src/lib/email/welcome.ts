// First-touch welcome emails.
//
// Fired once per user, gated by:
//   - For artists/venues: artist_profiles.welcomed_at / venue_profiles.welcomed_at
//     (set after a successful send so the next call is a no-op).
//   - For customers (no profile row): sendEmail's idempotency_key on
//     `welcome:${userId}` is the only dedupe.
//
// Callers: /api/auth/welcome (every SIGNED_IN, from AuthContext), /api/apply
// (once the artist bridge row exists) and /api/venue-profile (once the venue
// row exists). The last two matter because the sign-in trigger usually fires
// BEFORE the profile row is created, answers "no profile yet" below, and the
// client never retries it for that user.
//
// triggerWelcomeIfNeeded() is the only entry point. It's safe to call
// every login, short-circuits on the first sent send.
//
// Category: `recommendations`, the category all three welcome templates
// declare. These sends used to pass `tips`, so the preference the preview
// library showed next to each template ("Recommendations") was not the one the
// pipeline honoured ("Tips"), and the sends rode the news stream with the
// 2/168h tips throttle instead of the notify stream the templates were built
// for. The template is the contract; the send site follows it.
//
// Why split out from /api/auth/oauth-finalize: we want this to fire for
// both OAuth and email/password signups (the latter via a separate hook),
// and we want the heavy data-shaping (artist checklist state, customer
// featured works) in one place rather than smeared across routes.

import { sendEmail, type SendEmailResult } from "./send";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { ArtistWelcomeChecklist } from "@/emails/templates/onboarding/artist/ArtistWelcomeChecklist";
import { CustomerWelcome } from "@/emails/templates/onboarding/customer/CustomerWelcome";
import { VenueWelcomeChecklist } from "@/emails/templates/onboarding/venue/VenueWelcomeChecklist";
import type { ChecklistStep, Work } from "@/emails/types/emailTypes";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";
const SUPPORT_URL = `${SITE_URL}/support`;

export type WelcomeOutcome =
  | { ok: true; sent: boolean; reason?: string }
  | { ok: false; error: string };

export async function triggerWelcomeIfNeeded(userId: string): Promise<WelcomeOutcome> {
  const db = getSupabaseAdmin();
  const { data: { user }, error } = await db.auth.admin.getUserById(userId);
  if (error || !user?.email) {
    return { ok: false, error: error?.message || "user not found" };
  }

  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const role = typeof meta.user_type === "string" ? meta.user_type : null;
  if (role !== "artist" && role !== "customer" && role !== "venue") {
    return { ok: true, sent: false, reason: "no role" };
  }

  // Best-effort first name. Templates already default to "there" via the
  // shell, so this is just a nicety.
  const displayName = typeof meta.display_name === "string" ? meta.display_name : "";
  const firstNameFromMeta = displayName.split(" ").filter(Boolean)[0];

  if (role === "artist") return await sendArtistWelcome(db, userId, user.email, firstNameFromMeta);
  if (role === "venue") return await sendVenueWelcome(db, userId, user.email, firstNameFromMeta);
  return await sendCustomerWelcome(db, userId, user.email, firstNameFromMeta);
}

// ---------------------------------------------------------------------------

async function sendArtistWelcome(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  email: string,
  firstNameFallback: string
): Promise<WelcomeOutcome> {
  // welcomed_at + checklist data in one round-trip.
  const { data: profile } = await db
    .from("artist_profiles")
    .select(
      "id, name, slug, short_bio, location, postcode, stripe_connect_onboarding_complete, open_to_free_loan, open_to_revenue_share, open_to_outright_purchase, venue_types_suited_for, welcomed_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return { ok: true, sent: false, reason: "no profile yet" };
  if (profile.welcomed_at) return { ok: true, sent: false, reason: "already welcomed" };

  // First artwork? Cheap existence check.
  const { count: artworkCount } = await db
    .from("artist_works")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", profile.id);

  const profileComplete = Boolean(profile.short_bio?.trim() && (profile.location?.trim() || profile.postcode?.trim()));
  const hasArtwork = (artworkCount || 0) > 0;
  const stripeConnected = !!profile.stripe_connect_onboarding_complete;
  const placementPrefsSet =
    !!(profile.open_to_free_loan || profile.open_to_revenue_share || profile.open_to_outright_purchase) &&
    Array.isArray(profile.venue_types_suited_for) &&
    profile.venue_types_suited_for.length > 0;

  const profileUrl = `${SITE_URL}/artist-portal/profile`;
  const uploadArtworkUrl = `${SITE_URL}/artist-portal/portfolio`;
  const connectStripeUrl = `${SITE_URL}/artist-portal/billing`;
  const placementPreferencesUrl = `${SITE_URL}/artist-portal/profile#placements`;

  const allSteps: ChecklistStep[] = [
    { label: "Complete your profile", done: profileComplete, url: profileUrl },
    { label: "Upload your first artwork", done: hasArtwork, url: uploadArtworkUrl },
    { label: "Connect Stripe to get paid", done: stripeConnected, url: connectStripeUrl },
    { label: "Set your placement preferences", done: placementPrefsSet, url: placementPreferencesUrl },
  ];
  const remainingSteps = allSteps.filter((s) => !s.done);
  const completedSteps = allSteps.length - remainingSteps.length;

  const firstName = (profile.name?.trim().split(" ")[0]) || firstNameFallback || email.split("@")[0];

  const result = await sendEmail({
    idempotencyKey: `welcome:${userId}`,
    // Owner decision 7 (2026-08-28): this label was "welcome_artist", which is
    // not a registry id, so the audit could not connect the send to the
    // template it renders and the tips-category throttle keyed on a name no
    // registry entry owns. The 22 live email_events rows carrying the five old
    // labels were UPDATEd to the new ones in the same change, so history did
    // not split. Same change at the customer and venue sends below, at
    // offers/route.ts and at webhooks/supabase.
    template: "artist_welcome_checklist",
    category: "recommendations",
    to: email,
    subject: "Welcome to Wallplace, let's get your first placement",
    react: ArtistWelcomeChecklist({
      firstName,
      profileUrl,
      uploadArtworkUrl,
      connectStripeUrl,
      placementPreferencesUrl,
      completedSteps,
      remainingSteps,
    }),
    userId,
  });

  return await persistAndReturn(db, "artist_profiles", userId, result);
}

// ---------------------------------------------------------------------------

async function sendCustomerWelcome(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  email: string,
  firstNameFallback: string
): Promise<WelcomeOutcome> {
  // No customers profile table → idempotency_key is the only dedupe.
  // Pull 3 recent available works to seed the email.
  const { data: rawWorks } = await db
    .from("artist_works")
    .select("id, title, image, artist_id, price_band, dimensions, available")
    .eq("available", true)
    .order("created_at", { ascending: false })
    .limit(12);

  const featuredWorks: Work[] = [];
  if (rawWorks && rawWorks.length > 0) {
    // Join artist names + slugs in a second round-trip rather than a foreign-table
    // select (Supabase REST joins need the FK relationship registered).
    // Only surface artists the admin has approved, otherwise we'd
    // recommend pending applicants to brand-new customers (which leaks
    // un-reviewed portfolios into a public-facing email).
    const artistIds = Array.from(new Set(rawWorks.map((w) => w.artist_id))).slice(0, 12);
    const { data: artists } = await db
      .from("artist_profiles")
      .select("id, name, slug, review_status")
      .in("id", artistIds)
      .eq("review_status", "approved");
    const artistById = new Map((artists || []).map((a) => [a.id, a] as const));

    for (const w of rawWorks) {
      if (featuredWorks.length >= 3) break;
      const a = artistById.get(w.artist_id);
      // No matching approved artist → skip the work entirely. The
      // earlier behaviour also skipped on missing artist, but it didn't
      // distinguish "unknown artist row" from "pending review", which
      // let pending work through whenever the join returned all rows.
      if (!a) continue;
      featuredWorks.push({
        id: w.id,
        title: w.title || "Untitled",
        artistName: a.name,
        artistSlug: a.slug,
        image: w.image || "",
        url: `${SITE_URL}/browse/${a.slug}/${w.id}`,
        priceLabel: w.price_band || undefined,
        size: w.dimensions || undefined,
      });
    }
  }

  const firstName = firstNameFallback || email.split("@")[0];

  const result = await sendEmail({
    idempotencyKey: `welcome:${userId}`,
    template: "customer_welcome",
    category: "recommendations",
    to: email,
    subject: "Welcome to Wallplace",
    react: CustomerWelcome({
      firstName,
      browseUrl: `${SITE_URL}/browse`,
      featuredWorks,
      followArtistsUrl: `${SITE_URL}/browse?sort=newest`,
    }),
    userId,
  });

  // No profile to stamp; the idempotency key handles the no-double-send guarantee.
  if (!result.ok) return { ok: false, error: result.error };
  const sent = !("skipped" in result && result.skipped);
  return { ok: true, sent };
}

// ---------------------------------------------------------------------------

async function sendVenueWelcome(
  db: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  email: string,
  firstNameFallback: string
): Promise<WelcomeOutcome> {
  const { data: profile } = await db
    .from("venue_profiles")
    .select("id, name, welcomed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return { ok: true, sent: false, reason: "no profile yet" };
  if (profile.welcomed_at) return { ok: true, sent: false, reason: "already welcomed" };

  const firstName = (profile.name?.trim().split(" ")[0]) || firstNameFallback || email.split("@")[0];

  // VenueWelcomeChecklist's actual prop signature varies, keep this simple
  // and pass the bare minimum it expects. If that template wants richer
  // data later, expand here without touching callers.
  const result = await sendEmail({
    idempotencyKey: `welcome:${userId}`,
    template: "venue_welcome_checklist",
    category: "recommendations",
    to: email,
    subject: "Welcome to Wallplace, find your first artwork",
    react: VenueWelcomeChecklist({
      firstName,
      venueName: profile.name || "your venue",
      spaceUrl: `${SITE_URL}/venue-portal/profile`,
      uploadPhotosUrl: `${SITE_URL}/venue-portal/profile`,
      artPreferencesUrl: `${SITE_URL}/venue-portal/profile`,
      completedSteps: 0,
      remainingSteps: [
        { label: "Add photos of your space", done: false, url: `${SITE_URL}/venue-portal/profile` },
        { label: "Set your space details", done: false, url: `${SITE_URL}/venue-portal/profile` },
        { label: "Browse art for your venue", done: false, url: `${SITE_URL}/browse` },
      ],
    }),
    userId,
  });

  return await persistAndReturn(db, "venue_profiles", userId, result);
}

// ---------------------------------------------------------------------------

async function persistAndReturn(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: "artist_profiles" | "venue_profiles",
  userId: string,
  result: SendEmailResult
): Promise<WelcomeOutcome> {
  if (!result.ok) return { ok: false, error: result.error };
  const sent = !("skipped" in result && result.skipped);
  if (sent) {
    await db.from(table).update({ welcomed_at: new Date().toISOString() }).eq("user_id", userId);
  }
  return { ok: true, sent };
}
