"use client";

// Venue's view of a single artwork request — read details + manage
// artist responses (accept / decline).

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { getRecentRequestById } from "@/lib/recent-artwork-requests";

// Display label for an artist response. The API returns the artist's
// public slug ("fin-coles") rather than their display name; titlecasing
// the slug gives us something venue-friendly ("Fin Coles") without
// requiring an extra round-trip to /api/browse-artists. Hyphens and
// underscores both round-trip back into spaces; missing or empty slug
// degrades to the generic "Artist".
function artistDisplayName(slug: string | null): string {
  if (!slug) return "Artist";
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

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
  // Legacy `existing_works` rows may still exist in the DB; the artist
  // portal doesn't offer it as a new option but the venue still needs
  // to render the historic ones, so the union keeps it.
  response_type: "existing_works" | "placement" | "offer" | "commission" | "message";
  message: string;
  work_ids: string[];
  proposed_offer_amount_pence: number | null;
  proposed_commission_amount_pence: number | null;
  proposed_commission_timeline: string | null;
  proposed_monthly_fee_pence: number | null;
  proposed_qr_enabled: boolean | null;
  proposed_revenue_share_percent: number | null;
  status: string;
  linked_offer_id: string | null;
  linked_commission_id: string | null;
  linked_placement_id: string | null;
  created_at: string;
}

export default function VenueArtworkRequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [req, setReq] = useState<RequestRow | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the row we're showing came from the local just-submitted
  // cache (API didn't surface it). Drives a subtle "syncing" banner
  // so the user knows the row exists even if the portal hasn't fully
  // caught up yet.
  const [fromLocalCache, setFromLocalCache] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/artwork-requests/${id}`);
      const data = await res.json();
      if (data?.request) {
        setReq(data.request);
        setResponses(data.responses || []);
        setFromLocalCache(false);
      } else {
        // API returned nothing for a request the user just submitted,
        // QA hit this when the row exists publicly but `?mine=1`
        // wasn't surfacing it. Fall back to the locally-cached payload
        // so the detail page renders the request details instead of
        // sticking on "Loading…".
        const cached = getRecentRequestById(id);
        if (cached) {
          setReq({
            id: cached.id,
            title: cached.title,
            description: cached.description,
            intent: cached.intent,
            styles: cached.styles,
            mediums: cached.mediums,
            budget_min_pence: cached.budget_min_pence,
            budget_max_pence: cached.budget_max_pence,
            status: cached.status,
            visibility: cached.visibility,
            location: cached.location,
            timescale: cached.timescale,
            created_at: cached.created_at,
          });
          setResponses([]);
          setFromLocalCache(true);
        }
      }
    } catch {
      // Same fallback for network failures.
      const cached = getRecentRequestById(id);
      if (cached) {
        setReq({
          id: cached.id,
          title: cached.title,
          description: cached.description,
          intent: cached.intent,
          styles: cached.styles,
          mediums: cached.mediums,
          budget_min_pence: cached.budget_min_pence,
          budget_max_pence: cached.budget_max_pence,
          status: cached.status,
          visibility: cached.visibility,
          location: cached.location,
          timescale: cached.timescale,
          created_at: cached.created_at,
        });
        setResponses([]);
        setFromLocalCache(true);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function act(responseId: string, action: "accept" | "decline") {
    setBusy(responseId);
    setError(null);
    try {
      // mutate throws on a non-2xx (ApiError) or a dropped request, so the
      // navigate/reload only happens on a confirmed 2xx.
      const data = await mutate<{ nextStepLink?: string }>(
        `/api/artwork-requests/${id}/responses/${responseId}`,
        { method: "PATCH", body: JSON.stringify({ action }) },
      );
      if (action === "accept" && data?.nextStepLink) {
        window.location.href = data.nextStepLink;
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message || "Could not update response." : "Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(status: "open" | "closed" | "fulfilled") {
    // E43-c: this used to skip the res.ok check and swallow the catch, so a
    // 403/500/network failure on "Mark fulfilled" / "Close" silently did
    // nothing with no feedback. It now goes through mutate, which throws on a
    // non-2xx (ApiError) or a dropped request, so the reload only runs on a
    // confirmed 2xx and the reason always surfaces. Mirrors act()/fulfillResponse().
    setError(null);
    try {
      await mutate(`/api/artwork-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message || "Could not update the request status. Please try again." : "Network error. Please try again.");
    }
  }

  // D3 (Phase 2.9): "Mark fulfilled" routes through the new fulfill
  // API. The endpoint creates an order or placement per response_type
  // and returns the next page to navigate to. `existing_works`
  // responses surface a 2-button modal via existingWorksPrompt.
  const [existingWorksPrompt, setExistingWorksPrompt] = useState<{ responseId: string } | null>(null);

  async function fulfillResponse(
    responseId: string,
    action?: "order" | "placement",
  ) {
    setBusy(responseId);
    setError(null);
    try {
      // mutate throws on a non-2xx (ApiError) or a dropped request, so the
      // navigate/reload only happens on a confirmed 2xx.
      const data = await mutate<{ route_to?: string }>(`/api/artwork-requests/${id}/fulfill`, {
        method: "POST",
        body: JSON.stringify({ response_id: responseId, action }),
      });
      if (data?.route_to) {
        window.location.href = data.route_to;
      } else {
        await load();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message || "Could not fulfil response." : "Network error. Please try again.");
    } finally {
      setBusy(null);
      setExistingWorksPrompt(null);
    }
  }

  return (
    <VenuePortalLayout activePath="/venue-portal/artwork-requests">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        {loading || !req ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <Link href="/venue-portal/artwork-requests" className="text-xs text-muted hover:text-accent inline-block mb-4">← All requests</Link>
            {fromLocalCache && (
              <div className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                Just submitted. Your portal is still catching up, so we&rsquo;re
                showing this from your local cache. Responses from artists
                will appear here once the request finishes syncing.
              </div>
            )}
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
                  £{((req.budget_min_pence || 0) / 100).toFixed(0)} to £{((req.budget_max_pence || 0) / 100).toFixed(0)}
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
                            {artistDisplayName(r.artist_slug)}
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
                        {r.response_type === "placement" && (
                          <p className="text-xs text-muted mt-1">
                            Proposed: {r.proposed_monthly_fee_pence != null && r.proposed_monthly_fee_pence > 0
                              ? `£${(r.proposed_monthly_fee_pence / 100).toFixed(2)}/mo`
                              : "Free display"}
                            {r.proposed_revenue_share_percent != null && r.proposed_revenue_share_percent > 0
                              ? ` · ${r.proposed_revenue_share_percent}% rev share`
                              : ""}
                            {r.proposed_qr_enabled ? " · QR enabled" : ""}
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
                    {r.status === "accepted" && (r.linked_offer_id || r.linked_commission_id || r.linked_placement_id) && (
                      <p className="text-xs text-emerald-700 pt-2 border-t border-border">
                        {r.linked_offer_id && <Link href="/venue-portal/offers" className="hover:underline">View created offer →</Link>}
                        {r.linked_commission_id && <Link href="/venue-portal/commissions" className="hover:underline">View commission →</Link>}
                        {r.linked_placement_id && <Link href={`/placements/${r.linked_placement_id}`} className="hover:underline">View placement →</Link>}
                      </p>
                    )}
                    {r.status === "accepted" && req?.status === "open" && (
                      <div className="pt-2 border-t border-border mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (r.response_type === "existing_works") {
                              setExistingWorksPrompt({ responseId: r.id });
                            } else {
                              fulfillResponse(r.id);
                            }
                          }}
                          disabled={busy === r.id}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-sm transition-colors disabled:opacity-60"
                        >
                          Mark fulfilled
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {existingWorksPrompt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="bg-surface w-full max-w-md rounded-sm border border-border shadow-lg overflow-hidden">
            <div className="px-6 pt-6 pb-2">
              <h2 className="text-lg font-medium">Fulfil this existing-works response</h2>
              <p className="text-sm text-muted mt-2 leading-relaxed">
                The artist offered a piece they&rsquo;ve already made. Place it on
                loan in your venue, or buy it outright?
              </p>
            </div>
            <div className="px-6 py-5 flex flex-wrap justify-end gap-2 bg-background/40 border-t border-border">
              <button
                onClick={() => setExistingWorksPrompt(null)}
                className="px-3 py-2 text-xs rounded-sm border border-border hover:border-accent/40"
              >
                Cancel
              </button>
              <button
                onClick={() => fulfillResponse(existingWorksPrompt.responseId, "placement")}
                disabled={busy === existingWorksPrompt.responseId}
                className="px-3 py-2 text-xs rounded-sm border border-border hover:border-accent/40 disabled:opacity-60"
              >
                Place this work
              </button>
              <button
                onClick={() => fulfillResponse(existingWorksPrompt.responseId, "order")}
                disabled={busy === existingWorksPrompt.responseId}
                className="px-3 py-2 text-xs rounded-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
              >
                Buy this work
              </button>
            </div>
          </div>
        </div>
      )}
    </VenuePortalLayout>
  );
}
