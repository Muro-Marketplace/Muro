"use client";

// Venue's view of a single artwork request — read details + manage
// artist responses (accept / decline).

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";

interface RequestRow {
  id: string;
  title: string;
  description: string;
  intent: string[];
  styles: string[];
  mediums: string[];
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  status: string;
  visibility: string;
  location: string | null;
  timescale: string | null;
  created_at: string;
}

interface ResponseRow {
  id: string;
  artist_user_id: string;
  artist_slug: string | null;
  response_type: "existing_works" | "placement" | "offer" | "commission" | "message";
  message: string;
  work_ids: string[];
  proposed_offer_amount_pence: number | null;
  proposed_commission_amount_pence: number | null;
  proposed_commission_timeline: string | null;
  status: string;
  linked_offer_id: string | null;
  linked_commission_id: string | null;
  created_at: string;
}

export default function VenueArtworkRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [req, setReq] = useState<RequestRow | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/artwork-requests/${id}`);
      const data = await res.json();
      setReq(data.request);
      setResponses(data.responses || []);
    } catch {
      /* swallow */
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(responseId: string, action: "accept" | "decline") {
    setBusy(responseId);
    setError(null);
    try {
      const res = await authFetch(`/api/artwork-requests/${id}/responses/${responseId}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not update response.");
      } else if (action === "accept" && data.nextStepLink) {
        window.location.href = data.nextStepLink;
      } else {
        await load();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: "open" | "closed" | "fulfilled") {
    try {
      await authFetch(`/api/artwork-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch { /* swallow */ }
  }

  return (
    <VenuePortalLayout activePath="/venue-portal/artwork-requests">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        {loading || !req ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <Link href="/venue-portal/artwork-requests" className="text-xs text-muted hover:text-accent inline-block mb-4">← All requests</Link>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h1 className="text-2xl font-serif">{req.title}</h1>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border self-start capitalize ${
                req.status === "open" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-foreground/5 text-foreground/40 border-border"
              }`}>{req.status}</span>
            </div>
            <p className="text-sm text-muted mb-4">{req.description}</p>

            <div className="flex flex-wrap gap-2 text-[11px] mb-6">
              {req.intent.map((i) => <span key={i} className="px-2 py-1 bg-accent/5 text-accent rounded-sm capitalize">{i}</span>)}
              {req.styles.map((s) => <span key={s} className="px-2 py-1 bg-foreground/5 text-foreground/70 rounded-sm capitalize">{s}</span>)}
              {req.mediums.map((m) => <span key={m} className="px-2 py-1 bg-foreground/5 text-foreground/70 rounded-sm capitalize">{m}</span>)}
              {(req.budget_min_pence || req.budget_max_pence) && (
                <span className="px-2 py-1 bg-foreground/5 text-foreground/70 rounded-sm">
                  £{((req.budget_min_pence || 0) / 100).toFixed(0)}–£{((req.budget_max_pence || 0) / 100).toFixed(0)}
                </span>
              )}
              {req.location && <span className="px-2 py-1 bg-foreground/5 text-foreground/70 rounded-sm">{req.location}</span>}
              {req.timescale && <span className="px-2 py-1 bg-foreground/5 text-foreground/70 rounded-sm">{req.timescale}</span>}
            </div>

            {req.status === "open" && (
              <div className="flex gap-2 mb-8">
                <Link
                  href={`/venue-portal/artwork-requests/${id}/edit`}
                  className="px-3 py-1.5 text-xs font-medium text-foreground bg-surface border border-border hover:border-accent/40 hover:bg-foreground/5 rounded-sm transition-colors"
                >
                  Edit
                </Link>
                <button type="button" onClick={() => setStatus("fulfilled")} className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-sm transition-colors">Mark fulfilled</button>
                <button type="button" onClick={() => setStatus("closed")} className="px-3 py-1.5 text-xs text-muted bg-surface border border-border hover:bg-foreground/5 rounded-sm transition-colors">Close</button>
              </div>
            )}

            <h2 className="text-sm font-medium uppercase tracking-wider text-muted mb-3">Artist responses ({responses.length})</h2>
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            {responses.length === 0 ? (
              <p className="text-sm text-muted">No responses yet. Artists who think they&rsquo;re a fit will reach out here.</p>
            ) : (
              <ul className="space-y-3">
                {responses.map((r) => (
                  <li key={r.id} className="bg-surface border border-border rounded-sm p-5">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm">
                          <Link href={`/browse/${r.artist_slug}`} className="font-medium text-foreground hover:text-accent">
                            {r.artist_slug || "Artist"}
                          </Link>
                          <span className="text-muted capitalize"> · {r.response_type.replace("_", " ")}</span>
                        </p>
                        {r.proposed_offer_amount_pence && (
                          <p className="text-sm text-foreground mt-1"><strong>£{(r.proposed_offer_amount_pence / 100).toFixed(2)}</strong> offer</p>
                        )}
                        {r.proposed_commission_amount_pence && (
                          <p className="text-sm text-foreground mt-1">
                            <strong>£{(r.proposed_commission_amount_pence / 100).toFixed(2)}</strong> commission
                            {r.proposed_commission_timeline && <span className="text-muted"> · {r.proposed_commission_timeline}</span>}
                          </p>
                        )}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border capitalize ${
                        r.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : r.status === "declined" ? "bg-foreground/5 text-foreground/40 border-border"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                      }`}>{r.status}</span>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap mb-3">{r.message}</p>
                    {r.status === "sent" && (
                      <div className="flex gap-2 pt-2 border-t border-border">
                        <button type="button" onClick={() => act(r.id, "accept")} disabled={busy === r.id} className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-sm transition-colors disabled:opacity-60">Accept</button>
                        <button type="button" onClick={() => act(r.id, "decline")} disabled={busy === r.id} className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-sm transition-colors disabled:opacity-60">Decline</button>
                      </div>
                    )}
                    {r.status === "accepted" && (r.linked_offer_id || r.linked_commission_id) && (
                      <p className="text-xs text-emerald-700 pt-2 border-t border-border">
                        {r.linked_offer_id && <Link href="/venue-portal/offers" className="hover:underline">View created offer →</Link>}
                        {r.linked_commission_id && <Link href="/venue-portal/commissions" className="hover:underline">View commission →</Link>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </VenuePortalLayout>
  );
}
