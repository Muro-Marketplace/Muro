import { NextResponse } from "next/server";
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";
import { z } from "zod";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendAdminAlert } from "@/lib/email/admin-alert";
import { sendEmail } from "@/lib/email/send";
import { CurationEnquiryReceived } from "@/emails/templates/venue-lifecycle/CurationEnquiryReceived";
import {
  CURATION_TIERS as TIERS,
  CURATION_TIER_KEYS,
  type CurationTierKey as TierKey,
} from "@/lib/curation-tiers";

const safe = (n: number) => z.string().trim().max(n);
const optional = (n: number) => z.string().trim().max(n).optional().default("");

const curationSchema = z.object({
  // Derived from CURATION_TIERS so the validator cannot drift from the table.
  tier: z.enum(CURATION_TIER_KEYS),
  venueName: safe(200).min(1),
  contactName: safe(120).min(1),
  contactEmail: z.string().trim().email().max(320),
  contactPhone: optional(40),
  venueType: optional(80),
  location: optional(200),
  styleNotes: optional(2000),
  audienceNotes: optional(2000),
  moodNotes: optional(2000),
  budgetGbp: optional(40),
  wallCount: z.number().int().min(0).max(200).optional(),
  timeframe: optional(120),
  referencesNotes: optional(2000),
  // Venue's placement-method preferences. Stored in notes rather than as a
  // dedicated column so no migration is needed; the curator sees them in
  // the admin email and inside references_notes as context.
  placementMethods: z
    .array(z.enum(["qr_loan", "paid_loan", "direct_purchase"]))
    .optional()
    .default([]),
  // Wallplace Programmes (Task 2): intake fields for the quote-first
  // `programme` tier, backed by migration 121's nullable columns. Optional
  // here because this one schema also serves the three one-off tiers, which
  // never send these; when a value IS present (any tier) it is still fully
  // validated, so an out-of-range or mistyped value 400s rather than being
  // silently ignored.
  siteCount: z.number().int().positive().max(50).optional(),
  piecesEstimate: z.number().int().positive().max(60).optional(),
  rotationCadence: z.enum(["quarterly", "biannual", "none"]).optional(),
  sector: z.string().trim().max(80).optional(),
});

const METHOD_LABEL: Record<string, string> = {
  qr_loan: "QR-enabled loan",
  paid_loan: ARRANGEMENT_LABEL.paid_loan,
  direct_purchase: ARRANGEMENT_LABEL.purchase,
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = curationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please complete the required fields" }, { status: 400 });
  }
  const d = parsed.data;
  const tier = TIERS[d.tier as TierKey];
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

  // Try to associate with a logged-in user if an auth header is present, but
  // allow anonymous submissions too.
  let requesterUserId: string | null = null;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (token) {
    try {
      const { data } = await getSupabaseAdmin().auth.getUser(token);
      requesterUserId = data.user?.id || null;
    } catch { /* ignore, fall through as anonymous */ }
  }

  const db = getSupabaseAdmin();

  // Only one_off tiers can be pay-first; bespoke (one_off) and programme
  // (quoted_subscription) both carry payFirst: false, and quoted_subscription
  // tiers are never pay-first by design (see curation-tiers.ts), so this is
  // equivalent to `tier.payFirst` but reads unambiguously at every call site
  // below without needing tier.kind narrowed again.
  const isPayFirst = tier.kind === "one_off" && tier.payFirst;

  // Insert a pending row first; the webhook will update it to "paid" /
  // "in_progress" once Stripe confirms.
  const { data: row, error: insertError } = await db
    .from("curation_requests")
    .insert({
      requester_user_id: requesterUserId,
      venue_name: d.venueName,
      contact_name: d.contactName,
      contact_email: d.contactEmail,
      contact_phone: d.contactPhone,
      tier: d.tier,
      venue_type: d.venueType,
      location: d.location,
      style_notes: d.styleNotes,
      audience_notes: d.audienceNotes,
      mood_notes: d.moodNotes,
      budget_gbp: d.budgetGbp,
      wall_count: d.wallCount ?? null,
      timeframe: d.timeframe,
      references_notes: [
        d.placementMethods.length
          ? `Preferred placement methods: ${d.placementMethods.map((m) => METHOD_LABEL[m]).join(", ")}`
          : null,
        d.referencesNotes,
      ].filter(Boolean).join("\n\n"),
      // Wallplace Programmes (Task 2) intake fields. Only ever sent for the
      // `programme` tier; null for the one-off tiers, which is what migration
      // 121 made every one of these columns.
      site_count: d.siteCount ?? null,
      pieces_estimate: d.piecesEstimate ?? null,
      rotation_cadence: d.rotationCadence ?? null,
      sector: d.sector ?? null,
      status: isPayFirst ? "pending_payment" : "awaiting_quote",
      amount_paid_gbp: isPayFirst ? tier.priceGbp : null,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    // 23514 = check_violation. A tier or status the schema does not know about is a
    // deploy error (code and DB constraint out of sync), not a user error. Log it
    // loudly and distinctly so it pages instead of hiding inside a generic 500 —
    // this is exactly how the managed tiers were unsellable for months (D25).
    if ((insertError as { code?: string } | null)?.code === "23514") {
      console.error("[curation] tier/status rejected by a CHECK constraint — schema drift, not user input", {
        tier: d.tier,
        insertError,
      });
    }
    console.error("curation insert error:", insertError);
    return NextResponse.json({ error: "Could not create request" }, { status: 500 });
  }

  // Notify admin (awaited so it runs on serverless; .catch keeps mail failure non-fatal)
  // K1: was notifyAdminCurationRequest in the legacy module. Keyed on the
  // request id, so a retried submit cannot double-alert.
  await sendAdminAlert({
    idempotencyKey: `admin_curation_request:${row.id}`,
    subject: `Curation request: ${d.venueName} (${tier.label})`,
    summary: `${d.venueName} requested curation.`,
    fields: [
      { label: "Contact", value: `${d.contactName} <${d.contactEmail}>` },
      { label: "Tier", value: tier.label },
      ...(d.location ? [{ label: "Location", value: d.location }] : []),
      {
        label: "Flow",
        value: isPayFirst
          ? `Pay-first checkout (£${tier.priceGbp}), awaiting completion`
          : `Quote-first enquiry (from £${tier.priceGbp}), please send a quote`,
      },
    ],
    actionPath: "/admin/curation",
    actionLabel: "View in admin",
  });

  // Quote-first tiers: bespoke (one_off, payFirst: false) and programme
  // (quoted_subscription, always payFirst: false) both need an admin to send
  // a tailored quote before anything is chargeable, so neither creates a
  // Stripe session here. Before this fix, programme matched neither this
  // branch (it required tier.kind === "one_off") nor the managed branch
  // below, and fell through to the pay-first Stripe Checkout at the bottom of
  // this function — charging £79.99 immediately for what is meant to be a
  // quote-only tier.
  if (!isPayFirst) {
    // K1: was notifyCurationCustomerEnquiry in the legacy module.
    await sendEmail({
      idempotencyKey: `curation_enquiry_received:${row.id}`,
      template: "curation_enquiry_received",
      category: "orders_and_payouts",
      to: d.contactEmail,
      subject: "Your Wallplace curation enquiry",
      react: CurationEnquiryReceived({
        contactFirstName: (d.contactName || "there").split(" ")[0],
        venueName: d.venueName,
        tierLabel: tier.label,
        responseDays: 2,
      }),
      metadata: { curationRequestId: row.id, tier: tier.label },
    });
    return NextResponse.json({ mode: "enquiry", id: row.id });
  }

  // Pay-first one-off tiers: Stripe Checkout (one-time)
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: d.contactEmail,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Wallplace Curation, ${tier.label}`,
              description: d.venueName,
            },
            unit_amount: tier.priceGbp * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: "curation_request",
        curation_request_id: row.id,
        tier: d.tier,
      },
      success_url: `${siteUrl}/curated/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/curated?cancelled=1`,
    });
  } catch (err) {
    // D19: no Stripe session exists yet, so nothing can be paid. Removing the
    // row here is safe and keeps the table clean on a create failure.
    console.error("curation stripe session error:", err);
    await db.from("curation_requests").delete().eq("id", row.id);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }

  // D19: a payable session now exists. The row MUST survive from here — the
  // webhook attributes the payment by metadata.curation_request_id (the row
  // id), so a missing row means money taken with no record, email or refund
  // trail. Log a link failure and keep the row rather than deleting it.
  try {
    const { error: linkErr } = await db
      .from("curation_requests")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", row.id);
    if (linkErr) {
      console.error("curation session link failed, row retained", {
        requestId: row.id,
        sessionId: session.id,
        linkErr,
      });
    }
  } catch (linkErr) {
    console.error("curation session link threw, row retained", {
      requestId: row.id,
      sessionId: session.id,
      linkErr,
    });
  }

  return NextResponse.json({ mode: "checkout", url: session.url, id: row.id });
}
