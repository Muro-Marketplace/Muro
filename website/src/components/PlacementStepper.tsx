"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";

export interface PlacementStepperData {
  id: string;
  status: string;
  /** Timestamp the placement row was created — powers the first
      "Requested" step in the progress bar. */
  createdAt?: string | null;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
  /** Kept for backwards-compat with callers that still pass them —
      bilateral confirmation is no longer used. */
  proposedStage?: "installed" | "collected" | null;
  proposedByUserId?: string | null;
}

type Stage = "scheduled" | "installed" | "live" | "collected";

interface Step {
  key: "requested" | "accepted" | Stage;
  label: string;
  timestamp?: string | null;
  advanceable: boolean;
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Props {
  placement: PlacementStepperData;
  canAdvance?: boolean;
  currentUserId?: string | null;
  onChange?: (updated: PlacementStepperData) => void;
}

/**
 * Progress tracker for a placement. Shows the full six-step lifecycle
 * (Requested → Accepted → Scheduled → Installed → Live on wall →
 * Collected) from the moment a placement exists, so users can see where
 * things stand even while the request is still pending. The "Mark <next
 * stage>" action appears below the bar once the placement is active.
 */
export default function PlacementStepper({ placement, canAdvance = false, onChange }: Props) {
  const [busy, setBusy] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const steps: Step[] = [
    { key: "requested", label: "Requested",  timestamp: placement.createdAt ?? null,  advanceable: false },
    { key: "accepted",  label: "Accepted",   timestamp: placement.acceptedAt ?? null,  advanceable: false },
    { key: "scheduled", label: "Scheduled",  timestamp: placement.scheduledFor ?? null, advanceable: true },
    { key: "installed", label: "Installed",  timestamp: placement.installedAt ?? null, advanceable: true },
    { key: "live",      label: "Live on wall", timestamp: placement.liveFrom ?? null,  advanceable: true },
    { key: "collected", label: "Collected",  timestamp: placement.collectedAt ?? null, advanceable: true },
  ];

  const reachedIdx = steps.reduce((acc, s, i) => (s.timestamp ? i : acc), -1);
  const isDeclined = placement.status === "declined";

  async function advance(stage: Stage) {
    setBusy(stage);
    setError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: placement.id, stage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update stage");
        return;
      }
      const now = new Date().toISOString();
      const next: PlacementStepperData = { ...placement };
      if (stage === "scheduled") next.scheduledFor = now;
      if (stage === "installed") next.installedAt = now;
      if (stage === "live") next.liveFrom = now;
      if (stage === "collected") { next.collectedAt = now; next.status = "completed"; }
      onChange?.(next);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // Next advanceable stage = first advanceable step without a timestamp.
  const nextAdvanceable = steps.find((s) => s.advanceable && !s.timestamp);
  const nextStage = nextAdvanceable ? (nextAdvanceable.key as Stage) : null;
  const showAdvance = canAdvance && nextStage && placement.status === "active";

  return (
    <div className="mt-3">
      <ol className="flex items-start gap-1 overflow-x-auto pb-1">
        {steps.map((s, i) => {
          const reached = i <= reachedIdx;
          const isCurrent = i === reachedIdx;
          return (
            <li key={s.key} className="flex-1 min-w-[80px]">
              <div className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  isDeclined ? "bg-red-200 text-red-700" :
                  reached ? (isCurrent ? "bg-accent text-white" : "bg-green-500 text-white") :
                  "bg-border"
                }`}>
                  {reached ? (
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                  ) : (
                    <span className="text-[9px] text-muted">{i + 1}</span>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-px ${i < reachedIdx ? "bg-green-500" : "bg-border"}`} />
                )}
              </div>
              <div className="mt-1.5 pr-1">
                <p className={`text-[10px] font-medium ${reached ? "text-foreground" : "text-muted"}`}>{s.label}</p>
                {s.timestamp && (
                  <p className="text-[9px] text-muted">{formatDate(s.timestamp)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {showAdvance && nextStage && (() => {
        const label = steps.find((s) => s.key === nextStage)!.label.toLowerCase();
        return (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); advance(nextStage); }}
              disabled={busy !== null}
              className="px-3.5 py-1.5 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors disabled:opacity-60"
            >
              {busy === nextStage ? "Updating…" : `Mark ${label}`}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        );
      })()}
    </div>
  );
}
