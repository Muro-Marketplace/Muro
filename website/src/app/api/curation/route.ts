import { NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { notifyAdminCurationRequest, notifyCurationCustomerEnquiry } from "@/lib/email";

// Keep pricing server-side so a client can't submit a lower tier amount.
// Bespoke is a quote-first enquiry, no upfront charge, the admin follows up
// with a tailored quote and manual Stripe link.
// Managed tiers are recurring subscriptions charged through Stripe.
type OneOffTier = { kind: "one_off"; label: string; priceGbp: number; payFirst: boolean };
type ManagedTier = { kind: "managed"; label: string; priceGbp: number; interval: "month" | "quarter"; priceEnvVar: string };

const TIERS: Record<string, OneOffTier | ManagedTier> = {
  single_wall: { kind: "one_off", label: "Single wall", priceGbp: 49, payFirst: true },
  full_space: { kind: "one_off", label: "Full space", priceGbp: 149, payFirst: true },
  bespoke: { kind: "one_off", label: "Bespoke project", priceGbp: 299, payFirst: false },
  managed_monthly: { kind: "managed", label: "Managed, monthly rotation", priceGbp: 79.99, interval: "month", priceEnvVar: "STRIPE_PRICE_CURATION_MONTHLY" },
  managed_quarterly: { kind: "managed", label: "Managed, quarterly refresh", priceGbp: 199.99, interval: "quarter", priceEnvVar: "STRIPE_PRICE_CURATION_QUARTERLY" },
};

type TierKey = keyof typeof TIERS;

const safe = (n: number) => z.string().trim().max(n);
const optional = (n: number) => z.string().trim().max(n).optional().default("");

const curationSchema = z.object({
  tier: z.enum(["single_wall", "full_space", "bespoke", "managed_monthly", "managed_quarterly"]),
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
});

const METHOD_LABEL: Record<string, string> = {
  qr_loan: "QR-enabled loan",
  paid_loan: "Paid loan",
  direct_purchase: "Direct purchase",
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

  const isManaged = tier.kind === "managed";
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
      status: (isPayFirst || isManaged) ? "pending_payment" : "awaiting_quote",
      amount_paid_gbp: (isPayFirst || isManaged) ? tier.priceGbp : null,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error("curation insert error:", insertError);
    return NextResponse.json({ error: "Could not create request" }, { status: 500 });
  }

  // Fire-and-forget notification to admin, useful for all flows
  notifyAdminCurationRequest({
    requestId: row.id,
    tier: tier.label,
    payFirst: isPayFirst || isManaged,
    priceGbp: tier.priceGbp,
    venueName: d.venueName,
    contactName: d.contactName,
    contactEmail: d.contactEmail,
    location: d.location,
  }).catch((err) => { if (err) console.error("curation admin email error:", err); });

  // Bespoke tier: no upfront payment.
  if (tier.kind === "one_off" && !tier.payFirst) {
    notifyCurationCustomerEnquiry({
      email: d.contactEmail,
      contactName: d.contactName,
      venueName: d.venueName,
      tierLabel: tier.label,
    }).catch(() => {});
    return NextResponse.json({ mode: "enquiry", id: row.id });
  }

  // Managed tiers: recurring Stripe subscription. Requires a configured price
  // ID in the env (price has to pre-exist in Stripe since subscription
  // checkout can't accept ad-hoc price_data).
  if (tier.kind === "managed") {
    const priceId = process.env[tier.priceEnvVar];
    if (!priceId) {
      console.error(`Curation managed tier ${d.tier} missing env ${tier.priceEnvVar}`);
      await db.from("curation_requests").delete().eq("id", row.id);
      return NextResponse.json({ error: "Managed curation is not yet available, please try a one-off tier." }, { status: 503 });
    }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: d.contactEmail,
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          metadata: {
            kind: "curation_request",
            curation_request_id: row.id,
            tier: d.tier,
          },
        },
        metadata: {
          kind: "curation_request",
          curation_request_id: row.id,
          tier: d.tier,
        },
        success_url: `${siteUrl}/curated/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/curated?cancelled=1`,
      });

      await db
        .from("curation_requests")
        .update({ stripe_checkout_session_id: session.id })
        .eq("id", row.id);

      return NextResponse.json({ mode: "checkout", url: session.url, id: row.id });
    } catch (err) {
      console.error("curation managed stripe session error:", err);
      await db.from("curation_requests").delete().eq("id", row.id);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
    }
  }

  // Pay-first one-off tiers: Stripe Checkout (one-time)
  try {
    const session = await stripe.checkout.sessions.create({
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

    await db
      .from("curation_requests")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", row.id);

    return NextResponse.json({ mode: "checkout", url: session.url, id: row.id });
  } catch (err) {
    console.error("curation stripe session error:", err);
    await db.from("curation_requests").delete().eq("id", row.id);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
