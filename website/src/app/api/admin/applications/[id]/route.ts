import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { findUserByEmail } from "@/lib/auth/find-user-by-email";
import { parseRole } from "@/lib/auth-roles";
import { slugify } from "@/lib/slugify";
import { sendEmail } from "@/lib/email/send";
import { ArtistApplicationApproved } from "@/emails/templates/artist-additions/ArtistApplicationApproved";
import { ArtistApplicationRejected } from "@/emails/templates/artist-additions/ArtistApplicationRejected";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk";

// E30a / G1. The platform's admission gate, and the worst of the audit gaps:
// it creates or invites an auth user, REWRITES that user's user_metadata,
// inserts an artist_profiles row marked approved, and flips the application
// status, with nothing recorded anywhere. A compromised admin account could
// mint a platform identity and leave admin_audit_log empty.
//
// withAdmin owns the audit call so it cannot be forgotten. The handler keeps
// every one of its early returns as it was: `audit()` is called at the two
// points where a decision was actually made, and the wrapper writes the row
// before the response goes out.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAdmin(request, "application_decision", async ({ user, audit }) => {
  const { id } = await params;
  const body = await request.json();
  const action = body.action as "accept" | "reject";

  if (!action || !["accept", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();

    // Fetch the application
    const { data: app, error: fetchError } = await db
      .from("artist_applications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !app) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    if (app.status !== "pending") {
      return NextResponse.json(
        { error: `Application is already ${app.status}.` },
        { status: 409 }
      );
    }

    if (action === "reject") {
      const rejectErr = await updateApplicationStatus(db, id, "rejected", user!.id);
      if (rejectErr) {
        console.error("Reject update error:", rejectErr);
        return NextResponse.json({ error: "Failed to reject application" }, { status: 500 });
      }

      // Mirror the rejection onto the artist_profiles bridge row (created
      // at /api/apply time) so the applicant's portal lands on the
      // "Application not approved" screen rather than continuing to show
      // the under-review banner. Best-effort, the application row is the
      // source of truth for whether the applicant has been reviewed.
      if (app.email) {
        try {
          const existingUser = await findUserByEmail(db, app.email);
          if (existingUser) {
            const { error: profileErr } = await db
              .from("artist_profiles")
              .update({ review_status: "rejected" })
              .eq("user_id", existingUser.id);
            if (profileErr) {
              console.error("Reject profile sync error:", profileErr);
            }
          }
        } catch (syncErr) {
          console.error("Reject profile sync threw:", syncErr);
        }
      }

      // Rejection email, graceful decline with optional feedback.
      if (app.email) {
        await sendEmail({
          idempotencyKey: `application_rejected:${id}`,
          template: "artist_application_rejected",
          category: "placements",
          to: app.email,
          subject: "A note on your Wallplace application",
          react: ArtistApplicationRejected({
            firstName: (app.name || "there").split(" ")[0],
            feedback: (body.feedback as string | undefined) || undefined,
            reapplyInMonths: 6,
            supportUrl: `${SITE}/support`,
          }),
          metadata: { applicationId: id },
        });
      }

      // The decision, the target and the target's email. Never the row: the
      // context column is JSONB and would otherwise accumulate the full
      // application, portfolio links and artist statement included.
      audit({ applicationId: id, applicantEmail: app.email, decision: "rejected" },
        "application_rejected");
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // Accept: create or find auth user + artist profile
    const artistSlug = slugify(app.name);
    let userId: string;
    let invited = false;

    // Check if user already exists (from old auto-signup flow).
    //
    // Through the shared helper now. The inline version was `listUsers()` with
    // no arguments, which returns the FIRST 50 users, compared with `===`
    // against an address typed into an application form. Either miss lands on
    // the invite path below and creates a SECOND auth account for someone who
    // already has one. The case bug bites today; the pagination bug bites at
    // user 51.
    const existingUser = await findUserByEmail(db, app.email);

    if (existingUser) {
      userId = existingUser.id;
      // G5/H2: MERGE the metadata, never clobber it, and never demote an
      // existing role. The old write sent a fresh three-key object: GoTrue
      // shallow-merges top-level keys so unrelated keys survived, but
      // user_type was force-flipped to "artist" — a venue (or admin) who
      // also applied as an artist silently lost their portal. Spreading the
      // existing metadata keeps every key explicit rather than trusting
      // merge semantics, and the role rule is: keep venue/admin as they
      // are; only role-less and customer accounts become artists (becoming
      // an artist is the point of the application they submitted).
      const existingMeta = (existingUser.user_metadata ?? {}) as Record<string, unknown>;
      const existingRole = parseRole(existingMeta.user_type);
      const keepExistingRole = existingRole === "venue" || existingRole === "admin";
      await db.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...existingMeta,
          user_type: keepExistingRole ? existingRole : "artist",
          display_name: existingMeta.display_name || app.name,
          artist_slug: artistSlug,
        },
      });
    } else {
      // New user, send invite email
      const { data: inviteData, error: inviteError } =
        await db.auth.admin.inviteUserByEmail(app.email, {
          data: {
            user_type: "artist",
            display_name: app.name,
            artist_slug: artistSlug,
          },
        });

      if (inviteError) {
        console.error("Invite error:", inviteError);
        return NextResponse.json(
          { error: `Failed to invite user: ${inviteError.message}` },
          { status: 500 }
        );
      }

      userId = inviteData.user.id;
      invited = true;
    }

    // Generate a unique 6-char referral code for the new artist (item 25).
    // Retry on collision; unlikely but cheap to handle.
    function makeReferralCode(): string {
      return Math.random().toString(36).slice(2, 8).toUpperCase();
    }
    let referralCode = makeReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: existing } = await db
        .from("artist_profiles")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();
      if (!existing) break;
      referralCode = makeReferralCode();
    }

    // Create artist profile
    const { error: profileError } = await db
      .from("artist_profiles")
      .insert({
        user_id: userId,
        slug: artistSlug,
        name: app.name,
        location: app.location || "",
        primary_medium: app.primary_medium || "",
        discipline: app.discipline || null,
        sub_styles: app.sub_styles || [],
        short_bio: app.artist_statement?.slice(0, 200) || "",
        extended_bio: app.artist_statement || "",
        instagram: app.instagram || "",
        website: app.website || "",
        offers_originals: app.offers_originals || false,
        offers_prints: app.offers_prints || false,
        offers_framed: app.offers_framed || false,
        open_to_free_loan: app.open_to_free_loan || false,
        open_to_revenue_share: app.open_to_revenue_share || false,
        open_to_outright_purchase: app.open_to_purchase || false,
        delivery_radius: app.delivery_radius || "Greater London",
        venue_types_suited_for: app.venue_types || [],
        themes: app.themes || [],
        style_tags: [],
        available_sizes: [],
        referral_code: referralCode,
        referred_by_code: (app as Record<string, unknown>).referred_by_code as string | null || null,
        // CRITICAL: mark the new profile as approved. Migration 036
        // flipped the column default from 'approved' to 'pending', so
        // a profile inserted without an explicit value lands at
        // 'pending' and stays invisible to the public marketplace
        // (anon RLS on artist_profiles only exposes 'approved' rows)
        // and to /api/browse-artists (which filters on the same).
        // Admin clicking Accept here is the gate, the row should
        // be live the moment the gate opens.
        review_status: "approved",
        approved_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      // Don't fail the whole operation, user is created, profile can be fixed
    }

    // Belt-and-braces: ensure the artist's profile is marked approved
    // even when the INSERT above didn't run (existing-user branch,
    // unique-violation on a pre-existing row, or a later migration
    // introducing a default that drifts back to 'pending'). Acceptance
    // here is the single source of truth for "live on the marketplace".
    {
      const { error: approveErr } = await db
        .from("artist_profiles")
        .update({
          review_status: "approved",
          approved_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (approveErr) {
        console.error("Approve update error:", approveErr);
      }
    }

    // ─── Referral ledger (row G L2366) ───
    // `artist_referrals` held 0 rows across the whole production database. The
    // referrer's 30-day credit is applied later by the Stripe webhook
    // (`extend_free_until`, on the referred artist's first paid subscription),
    // but nothing ever recorded WHO referred WHOM, so there was no row to
    // reconcile that credit against and no way for a referrer to see a referral
    // in flight.
    //
    // Accept is the only moment both halves exist: the code sits on the
    // application, and the new artist has a user id for the first time. Written
    // before the status flip so a failure here is visible in the logs against a
    // still-pending application rather than a silently half-done accept.
    // Best-effort: a failure must not block admission.
    const referredByCode = ((app as Record<string, unknown>).referred_by_code as string | null) || null;
    if (referredByCode) {
      try {
        const { data: referrer } = await db
          .from("artist_profiles")
          .select("user_id, slug")
          .eq("referral_code", referredByCode)
          .maybeSingle<{ user_id: string; slug: string }>();

        if (!referrer) {
          // /api/apply validates the code now, so this is either a legacy row
          // from before that landed or an artist who has since been removed.
          console.warn("[accept] referral code on application matches no artist", { id });
        } else {
          const { error: ledgerErr } = await db.from("artist_referrals").insert({
            referrer_user_id: referrer.user_id,
            referrer_slug: referrer.slug,
            referral_code: referredByCode,
            referred_email: app.email,
            referred_user_id: userId,
            // The credit is not earned until the referred artist starts paying;
            // the webhook's `extend_free_until` is what converts this.
            status: "pending",
          });
          if (ledgerErr) console.error("Referral ledger insert error:", ledgerErr);
        }
      } catch (referralErr) {
        console.error("Referral ledger error:", referralErr);
      }
    }

    // Mark application as accepted. Goes through the same helper as the
    // reject path so a missing reviewed_at / reviewed_by column (migration
    // 052 not yet deployed) doesn't silently swallow the status flip and
    // leave the admin list showing "pending" forever.
    const acceptErr = await updateApplicationStatus(db, id, "accepted", user!.id);
    if (acceptErr) {
      console.error("Accept update error:", acceptErr);
      return NextResponse.json(
        { error: "Failed to mark application accepted" },
        { status: 500 },
      );
    }

    // Approved email. For new invited users, Supabase's invite email
    // already landed, this is the brand-polished follow-up.
    if (app.email) {
      await sendEmail({
        idempotencyKey: `application_approved:${id}`,
        template: "artist_application_approved",
        category: "placements",
        to: app.email,
        subject: "You're in, welcome to Wallplace",
        userId,
        react: ArtistApplicationApproved({
          firstName: (app.name || "there").split(" ")[0],
          goLiveUrl: `${SITE}/artist-portal`,
          welcomeMessage: (body.welcomeMessage as string | undefined) || undefined,
        }),
        metadata: { applicationId: id, userId },
      });
    }

    audit(
      { applicationId: id, applicantEmail: app.email, decision: "accepted", invited, userId },
      "application_accepted",
    );
    return NextResponse.json({
      success: true,
      status: "accepted",
      message: invited
        ? `Invite email sent to ${app.email}`
        : `${app.email} already had an account, profile created, they can log in now`,
    });
  } catch (err) {
    console.error("Accept/reject error:", err);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
  });
}

type AdminDb = ReturnType<typeof getSupabaseAdmin>;

/**
 * Flip artist_applications.status, and record who reviewed it and when.
 *
 * The error check is the part that matters and is kept: the original update had
 * none, so a failure left the row at status='pending' and the admin list kept
 * showing an applicant as awaiting review after Accept was clicked.
 *
 * The strip-and-retry that used to sit under it is DELETED. It dropped
 * `reviewed_at` and `reviewed_by` "for a legacy schema". Both columns exist in
 * production (migration 052, confirmed against the live schema and against
 * `tests/integration/schema-columns.json`), so the branch could never fire, and
 * if it ever did it would silently discard the audit trail on an admin decision
 * while reporting success. Same class as migration 109's, which destroyed a
 * referral code on every application for the same reason.
 */
async function updateApplicationStatus(
  db: AdminDb,
  id: string,
  status: "accepted" | "rejected",
  reviewerId: string,
): Promise<{ message: string } | null> {
  const fullPayload = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId,
  };

  const { error } = await db
    .from("artist_applications")
    .update(fullPayload)
    .eq("id", id);

  return error ? { message: error.message || "Unknown error" } : null;
}
