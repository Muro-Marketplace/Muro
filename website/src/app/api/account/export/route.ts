import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { AccountDataExportReady } from "@/emails/templates/account/AccountDataExportReady";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

// GET /api/account/export
// Authenticated user receives a JSON dump of every record we hold keyed to
// their user_id or email. Satisfies UK GDPR "right of access".
//
// C30/C33 (QA 2026-08-28): the page used to POST here (405 on every attempt),
// and the dump queried two tables that do not exist ("applications" and
// "waitlist" — the real names are artist_applications and waitlist_signups)
// and keyed artist_collections by user id where the column holds
// artist_profiles.id, so those sections were silently always empty
// (fetchAll swallows errors by design). It also omitted customer_profiles,
// customer_addresses and email_preferences, which the erasure route
// demonstrably knows exist. All fixed below; the route is also rate-limited
// now because each hit fans out ~20 admin queries.
export async function GET(request: Request) {
  // SARs are rare and heavy; 3 per 5 minutes is generous for a human and
  // stops a scripted caller hammering 20+ service-role queries per hit.
  const limited = await checkRateLimit(request, 3, 300_000);
  if (limited) return limited;

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return auth.error;

  const userId = auth.user!.id;
  const email = auth.user!.email || "";
  const db = getSupabaseAdmin();

  async function fetchAll<T>(table: string, column: string, value: string): Promise<T[]> {
    try {
      const { data } = await db.from(table).select("*").eq(column, value);
      return (data || []) as T[];
    } catch {
      return [];
    }
  }

  // artist_collections.artist_id holds artist_profiles.id, not the auth user
  // id, so resolve the profile id first and key both works and collections
  // off it.
  const { data: artistProfileRow } = await db
    .from("artist_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  const artistProfileId: string | null = artistProfileRow?.id ?? null;

  const [
    artistProfile,
    venueProfile,
    customerProfile,
    artistWorks,
    placementsArtist,
    placementsVenue,
    placementRecordsArtist,
    placementRecordsVenue,
    placementPhotos,
    messagesSent,
    messagesReceivedByUser,
    ordersBuyer,
    ordersArtist,
    refundRequests,
    savedItems,
    termsAcceptances,
    notifications,
    artistApplications,
    waitlistSignups,
    enquiries,
    collections,
    customerAddresses,
    emailPreferences,
  ] = await Promise.all([
    fetchAll("artist_profiles", "user_id", userId),
    fetchAll("venue_profiles", "user_id", userId),
    fetchAll("customer_profiles", "user_id", userId),
    artistProfileId
      ? fetchAll("artist_works", "artist_id", artistProfileId)
      : Promise.resolve([]),
    fetchAll("placements", "artist_user_id", userId),
    fetchAll("placements", "venue_user_id", userId),
    fetchAll("placement_records", "artist_user_id", userId),
    fetchAll("placement_records", "venue_user_id", userId),
    fetchAll("placement_photos", "uploader_user_id", userId),
    fetchAll("messages", "sender_id", userId),
    fetchAll("messages", "recipient_user_id", userId),
    email ? fetchAll("orders", "buyer_email", email) : Promise.resolve([]),
    fetchAll("orders", "artist_user_id", userId),
    fetchAll("refund_requests", "requester_user_id", userId),
    fetchAll("saved_items", "user_id", userId),
    fetchAll("terms_acceptances", "user_id", userId),
    fetchAll("notifications", "user_id", userId),
    email ? fetchAll("artist_applications", "email", email) : Promise.resolve([]),
    email ? fetchAll("waitlist_signups", "email", email) : Promise.resolve([]),
    email ? fetchAll("enquiries", "sender_email", email) : Promise.resolve([]),
    artistProfileId
      ? fetchAll("artist_collections", "artist_id", artistProfileId)
      : Promise.resolve([]),
    fetchAll("customer_addresses", "user_id", userId),
    fetchAll("email_preferences", "user_id", userId),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    user: { id: userId, email },
    data: {
      artistProfile,
      venueProfile,
      customerProfile,
      artistWorks,
      placements: {
        asArtist: placementsArtist,
        asVenue: placementsVenue,
      },
      placementRecords: {
        asArtist: placementRecordsArtist,
        asVenue: placementRecordsVenue,
      },
      placementPhotos,
      messages: {
        sent: messagesSent,
        received: messagesReceivedByUser,
      },
      orders: {
        asBuyer: ordersBuyer,
        asArtist: ordersArtist,
      },
      refundRequests,
      savedItems,
      termsAcceptances,
      notifications,
      artistApplications,
      waitlistSignups,
      enquiries,
      collections,
      customerAddresses,
      emailPreferences,
    },
  };

  // Receipt for the export, to the account's own address. Two jobs: it is the
  // record that a subject-access export was produced, and, because it goes to
  // the account's address whoever held the token, it is the signal the real
  // owner gets if someone else exported their data. The export is generated
  // on demand and served straight back, so there is no stored file to link
  // to: the button points at the account page, where a fresh copy can be
  // generated any time. Best-effort: the dump is the response either way.
  if (email) {
    const meta = (auth.user!.user_metadata ?? {}) as Record<string, unknown>;
    const displayName = typeof meta.display_name === "string" ? meta.display_name : "";
    try {
      await sendEmail({
        idempotencyKey: `account_data_export_ready:${userId}:${payload.exportedAt}`,
        template: "account_data_export_ready",
        category: "security",
        to: email,
        userId,
        subject: "Your Wallplace data export is ready",
        react: AccountDataExportReady({
          firstName: displayName.trim().split(" ").filter(Boolean)[0] || "there",
          downloadUrl: `${SITE}/account/export`,
          supportUrl: `${SITE}/support`,
        }),
        metadata: { exportedAt: payload.exportedAt },
      });
    } catch (err) {
      console.error("[account/export] receipt email failed:", err);
    }
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="wallplace-export-${userId}-${Date.now()}.json"`,
    },
  });
}

// C30: the shipped export page POSTed here and 405'd forever. The page now
// GETs, but a stale cached bundle may still POST, so serve the same dump on
// POST rather than answering 405 to a legitimate signed-in export request.
export { GET as POST };
