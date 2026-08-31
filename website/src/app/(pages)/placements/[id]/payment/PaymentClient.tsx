"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authFetch } from "@/lib/api-client";

interface Props {
  placementId: string;
  workTitle: string;
  monthlyFeeGbp: number;
  artistName: string;
  qrEnabled: boolean;
}

export default function PaymentClient({ placementId, workTitle, monthlyFeeGbp, artistName, qrEnabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Row 2187 area. The setup route's cancel_url returns here as ?cancelled=1
  // and nothing read it, so backing out of Stripe landed on an unchanged page
  // with no word either way. Same silent return as ?payment=setup-complete on
  // the placements list, which is fixed alongside this.
  const cancelled = useSearchParams().get("cancelled") === "1";

  async function startCheckout() {
    setBusy(true);
    setError(null);
    // OWNER-GATED (money boundary, 05): this starts the paid-loan Stripe CHECKOUT
    // (creates the subscription payment session and redirects the venue to pay), so
    // it is NOT migrated to mutate() until the owner signs off, exactly like the
    // OffersList checkout and the orders refund handlers. It stays on authFetch and
    // remains flagged/grandfathered in the no-authfetch-mutation ratchet.
    try {
      const res = await authFetch(`/api/placements/${placementId}/payment/setup`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start payment setup.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[640px] mx-auto px-6 py-14">
      {cancelled && (
        <div role="status" className="mb-6 rounded-sm border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground">Payment setup cancelled. Nothing was charged.</p>
          <p className="text-xs text-muted mt-0.5">You can start it again whenever you are ready.</p>
        </div>
      )}
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-accent mb-3">Monthly payment setup</p>
      <h1 className="font-serif text-3xl sm:text-4xl text-foreground leading-tight mb-3">
        Pay {artistName} monthly for this placement
      </h1>
      {/* F35: the Stripe subscription anchors on the setup date, not the
          1st of the month, so the charge lands monthly on the signup
          anniversary. Don't say "at the start of each month". */}
      <p className="text-muted leading-relaxed mb-8">
        You agreed a paid loan for <span className="text-foreground font-medium">{workTitle}</span>.
        Your card is charged <span className="text-foreground font-semibold">&pound;{monthlyFeeGbp}</span> each
        month from your start date. Cancel any time from your portal, you stay charged
        for the current month only.
      </p>

      <div className="rounded-sm border border-border bg-surface p-5 space-y-3 mb-8">
        <Row label="Work" value={workTitle} />
        <Row label="Artist" value={artistName} />
        <Row label="Monthly fee" value={`£${monthlyFeeGbp}`} />
        <Row label="QR code" value={qrEnabled ? "On, so buyers can scan through to the artist's shop" : "Off"} />
        <Row label="Billing" value="Monthly, starting today. Cancels when you end the placement." />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={startCheckout}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white text-sm font-semibold rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {busy ? "Redirecting…" : `Start monthly payment, £${monthlyFeeGbp}/mo`}
        </button>
        <Link
          href="/venue-portal/placements"
          className="inline-flex items-center justify-center px-6 py-3 text-sm text-muted hover:text-foreground transition-colors"
        >
          Back to placements
        </Link>
      </div>

      <p className="text-[11px] text-muted pt-8">
        You&rsquo;ll be redirected to Stripe to add your card. Payments are processed by Stripe;
        Wallplace never stores your card details.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted shrink-0">{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}
