import Link from "next/link";
import type { Metadata } from "next";
import { stripe } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Curation",
};

// D24: this page used to be a static component that always read "Payment
// received." with no verification, even though the Stripe success URL carries a
// session_id. It now retrieves the checkout session and branches on
// payment_status, so a buyer whose payment is still settling (or who lands here
// with a bad session id) is never told the money was taken when it was not.
type SuccessState = "paid" | "processing" | "no_session";

async function resolveState(sessionId: string | undefined): Promise<SuccessState> {
  if (!sessionId) return "no_session";
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    // One-off checkouts report "paid"; a managed subscription's first invoice
    // also settles the session to "paid". Anything else (unpaid, still pending)
    // has not been confirmed, so we must not claim receipt.
    return session.payment_status === "paid" ? "paid" : "processing";
  } catch (err) {
    // A bad or expired session id, or a Stripe error: we cannot confirm the
    // payment, so show the neutral processing state rather than a false receipt.
    console.error("curation success: could not retrieve session", { sessionId, err });
    return "processing";
  }
}

export default async function CurationSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const state = await resolveState(sessionId);

  const heading =
    state === "paid"
      ? "Thanks, your curation is underway."
      : state === "processing"
        ? "We're confirming your payment."
        : "Start your curation.";

  const body =
    state === "paid"
      ? "Payment received. Our curators will review your brief and email you a tailored shortlist within 5 business days. Keep an eye on your inbox."
      : state === "processing"
        ? "Your payment is still being confirmed, which usually takes a few moments. We'll email you the moment it clears, and your shortlist follows within 5 business days of confirmation."
        : "Tell us about your space and we'll curate a shortlist of artists for your walls.";

  return (
    <div className="max-w-[720px] mx-auto px-6 py-20 lg:py-28 text-center">
      {state === "paid" ? (
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-8">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      ) : (
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 mb-8">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        </div>
      )}
      <h1 className="font-serif text-3xl lg:text-4xl text-foreground mb-4">{heading}</h1>
      <p className="text-base text-muted leading-relaxed mb-8">{body}</p>
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {state === "no_session" ? (
          <Link href="/curated" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
            Start curation
          </Link>
        ) : (
          <Link href="/browse" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase bg-accent text-white rounded-sm hover:bg-accent-hover transition-colors">
            Browse artists
          </Link>
        )}
        <Link href="/" className="px-6 py-3 text-sm font-semibold tracking-wider uppercase border border-border text-foreground hover:border-foreground/30 rounded-sm transition-colors">
          Back home
        </Link>
      </div>
    </div>
  );
}
