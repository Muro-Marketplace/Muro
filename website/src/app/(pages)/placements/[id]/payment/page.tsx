"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import PaymentClient from "./PaymentClient";

/**
 * /placements/[id]/payment, monthly payment setup for a paid-loan placement.
 *
 * Product state: the page surfaces the agreed monthly fee, who it's paid to,
 * and a button to start a Stripe-hosted subscription. The actual subscription
 * creation lives behind /api/placements/[id]/payment/setup so the commercial
 * flow (platform-fee split, destination charge vs transfer, VAT, etc.) can
 * land in a single place once the billing model is decided.
 */
export default function PlacementPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading } = useAuth();
  const router = useRouter();
  const [placement, setPlacement] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "forbidden" | "no-fee">("loading");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    authFetch(`/api/placements?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        const p = (data.placements || []).find((x: { id: string }) => x.id === id);
        if (!p) { setState("not-found"); return; }
        if (p.venue_user_id !== user.id) { setState("forbidden"); return; }
        if (!p.monthly_fee_gbp || p.monthly_fee_gbp <= 0) { setState("no-fee"); return; }
        setPlacement(p);
        setState("ready");
      })
      .catch(() => setErr("Could not load placement."));
  }, [id, user, loading, router]);

  if (state === "loading") {
    return <div className="max-w-[640px] mx-auto px-6 py-20 text-sm text-muted">Loading…</div>;
  }
  if (state === "not-found") {
    return <Msg title="Placement not found" body="This placement no longer exists or you don't have access." />;
  }
  if (state === "forbidden") {
    return <Msg title="Payment setup" body="Only the venue can set up monthly payments for a paid loan." />;
  }
  if (state === "no-fee") {
    return <Msg title="No monthly fee on this placement" body="This placement isn't a paid loan, so there's nothing to set up here." />;
  }
  if (err || !placement) return <Msg title="Something went wrong" body={err || "Please try again."} />;

  return (
    <PaymentClient
      placementId={String(placement.id)}
      workTitle={String(placement.work_title || "Artwork")}
      monthlyFeeGbp={Number(placement.monthly_fee_gbp) || 0}
      artistName={String(placement.artist_slug || placement.artist_name || "the artist")}
      artistReady={Boolean(placement.artist_stripe_ready)}
      qrEnabled={Boolean(placement.qr_enabled)}
    />
  );
}

function Msg({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-[640px] mx-auto px-6 py-20">
      <h1 className="font-serif text-3xl mb-4">{title}</h1>
      <p className="text-muted">{body}</p>
    </div>
  );
}
