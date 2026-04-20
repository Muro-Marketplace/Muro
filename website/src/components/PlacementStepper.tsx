"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";

export interface PlacementStepperData {
  id: string;
  status: string;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
}

type Stage = "accepted" | "scheduled" | "installed" | "live" | "collected";

interface Step {
  key: Stage;
  label: string;
  timestamp?: string | null;
}

function formatDate(ts: string | null | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Props {
  placement: PlacementStepperData;
  canAdvance?: boolean;
  onChange?: (updated: PlacementStepperData) => void;
}

export default function PlacementStepper({ placement, canAdvance = false, onChange }: Props) {
  const [busy, setBusy] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const steps: Step[] = [
    { key: "accepted",  label: "Accepted",  timestamp: placement.acceptedAt },
    { key: "scheduled", label: "Scheduled", timestamp: placement.scheduledFor },
    { key: "installed", label: "Installed", timestamp: placement.installedAt },
    { key: "live",      label: "Live on wall", timestamp: placement.liveFrom },
    { key: "collected", label: "Collected", timestamp: placement.collectedAt },
  ];

  const reachedIdx = steps.reduce((acc, s, i) => (s.timestamp ? i : acc), -1);

  async function advance(stage: Stage) {
    if (stage === "accepted") return; // Set automatically on accept
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

  const nextStage: Stage | null = reachedIdx < 0
    ? null
    : reachedIdx >= steps.length - 1
      ? null
      : (steps[reachedIdx + 1].key);

  // If not yet accepted (status still pending or declined), don't show stepper
  if (placement.status !== "active" && placement.status !== "completed") {
    return null;
  }

  return (
    <div className="mt-3">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {steps.map((s, i) => {
          const reached = i <= reachedIdx;
          const isCurrent = i === reachedIdx;
          return (
            <li key={s.key} className="flex-1 min-w-[80px]">
              <div className="flex items-center gap-1">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  reached ? (isCurrent ? "bg-accent text-white" : "bg-green-500 text-white") : "bg-border"
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
              <div className="mt-1 pr-1">
                <p className={`text-[10px] font-medium ${reached ? "text-foreground" : "text-muted"}`}>{s.label}</p>
                {s.timestamp && (
                  <p className="text-[9px] text-muted">{formatDate(s.timestamp)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canAdvance && nextStage && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); advance(nextStage); }}
            disabled={busy !== null}
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
          >
            {busy === nextStage ? "Updating\u2026" : `Mark ${steps.find((s) => s.key === nextStage)!.label.toLowerCase()}`}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
