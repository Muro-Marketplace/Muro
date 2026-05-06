"use client";

// Artist responds to a venue artwork request. Single page with the
// request body + a response form. Response type drives extra fields
// (offer amount, commission timeline, work picker, etc).

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import ImageWithFallback from "@/components/ImageWithFallback";
import { authFetch } from "@/lib/api-client";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";

type ResponseType = "existing_works" | "placement" | "offer" | "commission" | "message";

interface RequestRow {
  id: string;
  title: string;
  description: string;
  intent: string[];
  styles: string[];
  mediums: string[];
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  location: string | null;
  timescale: string | null;
  venue_slug: string | null;
  status: string;
}

const TYPE_LABELS: Record<ResponseType, { name: string; tip: string }> = {
  existing_works: { name: "Suggest existing works", tip: "Pick from your portfolio." },
  placement: { name: "Propose a placement", tip: "Loan or revenue share — venue confirms terms next." },
  offer: { name: "Quote a price", tip: "Name a price for one of your works." },
  commission: { name: "Suggest a commission", tip: "Custom-make something for this brief." },
  message: { name: "Just a message", tip: "Open the conversation; no proposal yet." },
};

export default function ArtistArtworkRequestRespondPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { artist } = useCurrentArtist();
  const [req, setReq] = useState<RequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [responseType, setResponseType] = useState<ResponseType>("message");
  const [message, setMessage] = useState("");
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
  // Per-work size selection. Keys are work ids, values are the chosen
  // pricing[*].label. Undefined = "no preference, send as-is".
  const [workSizeLabels, setWorkSizeLabels] = useState<Record<string, string>>({});
  const [offerAmount, setOfferAmount] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [commissionTimeline, setCommissionTimeline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/artwork-requests/${id}`);
      const data = await res.json();
      setReq(data.request);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function toggleWork(workId: string) {
    setSelectedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(workId)) next.delete(workId); else next.add(workId);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!message.trim()) {
      setError("Add a short message explaining the fit.");
      return;
    }
    if ((responseType === "existing_works" || responseType === "offer" || responseType === "placement") && selectedWorks.size === 0 && responseType !== "placement") {
      setError("Pick at least one work.");
      return;
    }
    setSubmitting(true);
    try {
      const selections = Array.from(selectedWorks).map((id) => ({
        id,
        sizeLabel: workSizeLabels[id] || undefined,
      }));
      const body: Record<string, unknown> = {
        responseType,
        message: message.trim(),
        // Send the new selections shape; the server still accepts plain
        // workIds for back-compat.
        workSelections: selections,
        workIds: selections.map((s) => s.id),
      };
      if (responseType === "offer" && offerAmount) {
        body.proposedOfferAmountPence = Math.round(parseFloat(offerAmount) * 100);
      }
      if (responseType === "commission" && commissionAmount) {
        body.proposedCommissionAmountPence = Math.round(parseFloat(commissionAmount) * 100);
        body.proposedCommissionTimeline = commissionTimeline.trim() || undefined;
      }
      const res = await authFetch(`/api/artwork-requests/${id}/responses`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        // Cap-hit error → show the friendly message verbatim.
        setError(data.message || data.error || "Could not send response.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  if (loading || !req) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/artwork-requests">
        <p className="text-sm text-muted py-12 text-center">Loading…</p>
      </ArtistPortalLayout>
    );
  }

  const works = artist?.works || [];

  return (
    <ArtistPortalLayout activePath="/artist-portal/artwork-requests">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <Link href="/artist-portal/artwork-requests" className="text-xs text-muted hover:text-accent inline-block mb-4">← All requests</Link>

        <h1 className="text-2xl font-serif mb-2">{req.title}</h1>
        <p className="text-sm text-muted mb-2">From {req.venue_slug}</p>
        <p className="text-sm text-foreground/80 leading-relaxed mb-4 whitespace-pre-wrap">{req.description}</p>
        <div className="flex flex-wrap gap-2 text-[10px] mb-8">
          {req.intent.map((i) => <span key={i} className="px-1.5 py-0.5 bg-accent/5 text-accent rounded-sm capitalize">{i}</span>)}
          {(req.budget_min_pence || req.budget_max_pence) && (
            <span className="px-1.5 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">
              £{((req.budget_min_pence || 0) / 100).toFixed(0)}–£{((req.budget_max_pence || 0) / 100).toFixed(0)}
            </span>
          )}
          {req.location && <span className="px-1.5 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">{req.location}</span>}
        </div>

        {submitted ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-sm p-5">
            <p className="text-sm text-emerald-800">Response sent. The venue will be in touch.</p>
            <Link href="/artist-portal/artwork-requests" className="text-xs text-emerald-700 hover:underline mt-2 inline-block">Back to requests</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 bg-surface border border-border rounded-sm p-5">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted mb-2">Your response</h2>

            <div>
              <p className="block text-xs uppercase tracking-wider text-muted mb-2">Response type</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {(["existing_works", "placement", "offer", "commission", "message"] as ResponseType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setResponseType(t)} className={`text-left p-3 rounded-sm border transition-colors ${
                    responseType === t ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                  }`}>
                    <p className="text-sm font-medium">{TYPE_LABELS[t].name}</p>
                    <p className="text-[11px] text-muted">{TYPE_LABELS[t].tip}</p>
                  </button>
                ))}
              </div>
            </div>

            {(responseType === "existing_works" || responseType === "offer") && works.length > 0 && (
              <div>
                <p className="block text-xs uppercase tracking-wider text-muted mb-2">Pick works</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {works.map((w) => (
                    <button
                      key={w.id || w.title}
                      type="button"
                      onClick={() => toggleWork(w.id || w.title)}
                      className={`relative aspect-square overflow-hidden rounded-sm border transition-colors ${
                        selectedWorks.has(w.id || w.title) ? "border-accent ring-1 ring-accent" : "border-border"
                      }`}
                    >
                      {w.image && (
                        <ImageWithFallback
                          src={w.image}
                          alt={w.title}
                          className="w-full h-full object-cover"
                          placeholderClassName="w-full h-full bg-accent/10 text-accent flex items-center justify-center text-2xl font-medium"
                        />
                      )}
                      <span className="absolute bottom-0 inset-x-0 px-1 py-0.5 bg-black/55 text-white text-[10px] truncate">{w.title}</span>
                    </button>
                  ))}
                </div>

                {/* Per-work size picker — shown for each work the artist
                    selected that has more than one pricing tier. Lets
                    them tell the venue exactly which size they're
                    suggesting. */}
                {selectedWorks.size > 0 && (
                  <div className="mt-3 space-y-2">
                    {Array.from(selectedWorks).map((wid) => {
                      const w = works.find((x) => (x.id || x.title) === wid);
                      if (!w) return null;
                      const tiers = (w.pricing || []) as { label: string; price: number }[];
                      if (tiers.length <= 1) return null;
                      const currentLabel = workSizeLabels[wid] || "";
                      return (
                        <div key={wid} className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                          <span className="text-foreground/70 font-medium sm:w-40 truncate">{w.title}</span>
                          <select
                            value={currentLabel}
                            onChange={(e) =>
                              setWorkSizeLabels((prev) => {
                                const next = { ...prev };
                                if (e.target.value) next[wid] = e.target.value;
                                else delete next[wid];
                                return next;
                              })
                            }
                            className="flex-1 px-2 py-1.5 bg-background border border-border rounded-sm text-xs focus:outline-none focus:border-accent/60"
                          >
                            <option value="">Any size</option>
                            {tiers.map((t) => (
                              <option key={t.label} value={t.label}>
                                {t.label} — £{t.price.toFixed(0)}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {responseType === "offer" && (
              <div>
                <label htmlFor="offer-amt" className="block text-xs uppercase tracking-wider text-muted mb-1.5">Quoted price (£)</label>
                <input id="offer-amt" type="number" step="0.01" min="0" value={offerAmount} onChange={(e) => setOfferAmount(e.target.value)} className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60" />
              </div>
            )}

            {responseType === "commission" && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="com-amt" className="block text-xs uppercase tracking-wider text-muted mb-1.5">Quoted price (£)</label>
                  <input id="com-amt" type="number" step="0.01" min="0" value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60" />
                </div>
                <div>
                  <label htmlFor="com-tl" className="block text-xs uppercase tracking-wider text-muted mb-1.5">Timeline</label>
                  <input id="com-tl" type="text" value={commissionTimeline} onChange={(e) => setCommissionTimeline(e.target.value)} placeholder="6–8 weeks" className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60" />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="msg" className="block text-xs uppercase tracking-wider text-muted mb-1.5">Message</label>
              <textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} placeholder="Why does this work / brief feel like a fit?" className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y" />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button type="submit" disabled={submitting} className="w-full px-5 py-3 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60">
              {submitting ? "Sending…" : "Send response"}
            </button>
            <p className="text-[11px] text-muted text-center">
              Counts towards your daily venue-outreach allowance (placements + first-contact messages + responses).
            </p>
          </form>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
