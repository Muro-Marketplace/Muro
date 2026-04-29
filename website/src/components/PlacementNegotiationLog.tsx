"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";

interface Props {
  placementId: string;
}

interface LogEntry {
  id: string | number;
  created_at: string;
  message_type: "placement_request" | "placement_response";
  sender_name?: string;
  sender_type?: string;
  content?: string | null;
  metadata?: {
    placementId?: string;
    status?: "active" | "declined";
    counter?: boolean;
    arrangementType?: string;
    revenueSharePercent?: number | null;
    monthlyFeeGbp?: number | null;
    qrEnabled?: boolean | null;
    message?: string | null;
  } | null;
}

function formatDateTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function describeTerms(meta: LogEntry["metadata"]): string | null {
  if (!meta) return null;
  const bits: string[] = [];
  if (meta.arrangementType === "free_loan" || typeof meta.monthlyFeeGbp === "number") {
    if (typeof meta.monthlyFeeGbp === "number" && meta.monthlyFeeGbp > 0) {
      bits.push(`Paid loan £${meta.monthlyFeeGbp}/mo`);
    } else {
      bits.push("Paid loan");
    }
  }
  if (meta.arrangementType === "revenue_share" || typeof meta.revenueSharePercent === "number") {
    if (typeof meta.revenueSharePercent === "number" && meta.revenueSharePercent > 0) {
      bits.push(`${meta.revenueSharePercent}% revenue share`);
    }
  }
  if (meta.arrangementType === "purchase") bits.push("Direct purchase");
  if (meta.qrEnabled === true) bits.push("QR enabled");
  if (meta.qrEnabled === false) bits.push("QR disabled");
  return bits.length ? bits.join(" · ") : null;
}

/**
 * Chronological log of the offers, counters, and responses that led to
 * the current terms. Reads placement_request + placement_response
 * messages carrying this placement id. Collapsed by default, most
 * placements have one exchange; the log is here for the hairy
 * back-and-forth cases where "what did we agree?" matters.
 */
export default function PlacementNegotiationLog({ placementId }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/placements/${encodeURIComponent(placementId)}/history`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setEntries(Array.isArray(data.entries) ? data.entries : []);
      } catch { /* ignore, log is optional */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [placementId]);

  if (loading) return null;
  if (entries.length === 0) return null;

  const shown = expanded ? entries : entries.slice(0, 3);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-xl text-foreground">Negotiation log</h2>
        <span className="text-[11px] text-muted">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
      </div>
      <ol className="space-y-2">
        {shown.map((entry) => {
          const isResponse = entry.message_type === "placement_response";
          const isCounter = entry.metadata?.counter === true;
          const terms = describeTerms(entry.metadata);
          const accentColor = isResponse
            ? entry.metadata?.status === "declined"
              ? "border-red-200 bg-red-50"
              : "border-emerald-200 bg-emerald-50"
            : isCounter
              ? "border-amber-200 bg-amber-50"
              : "border-border bg-surface";
          const title = isResponse
            ? entry.metadata?.status === "declined"
              ? "Declined"
              : "Accepted"
            : isCounter
              ? "Counter offer"
              : "Initial request";
          return (
            <li key={entry.id} className={`rounded-sm border px-4 py-3 ${accentColor}`}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-[11px] text-muted">{formatDateTime(entry.created_at)}</p>
              </div>
              {entry.sender_name && (
                <p className="text-[11px] text-muted mt-0.5">From {entry.sender_name}</p>
              )}
              {terms && (
                <p className="text-xs text-foreground mt-1">{terms}</p>
              )}
              {entry.content && !/^Counter offer sent:/.test(entry.content) && (
                <p className="text-xs text-muted mt-1 whitespace-pre-wrap">{entry.content}</p>
              )}
            </li>
          );
        })}
      </ol>
      {entries.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs text-accent hover:text-accent-hover"
        >
          {expanded ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}
