"use client";

import { useState } from "react";
import { authFetch } from "@/lib/api-client";

export interface PlacementStepperData {
  id: string;
  status: string;
  /** Timestamp the placement row was created, powers the first
      "Requested" step in the progress bar. */
  createdAt?: string | null;
  acceptedAt?: string | null;
  scheduledFor?: string | null;
  installedAt?: string | null;
  liveFrom?: string | null;
  collectedAt?: string | null;
  /** Kept for backwards-compat with callers that still pass them,
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

function isoDateToInput(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
 *
 * Scheduling is special: rather than stamping "now", the stepper opens
 * a date picker so either side can pre-book an install date. Once set,
 * the date can be edited via the same input.
 */
export default function PlacementStepper({ placement, canAdvance = false, onChange }: Props) {
  const [busy, setBusy] = useState<Stage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<string>(() => isoDateToInput(placement.scheduledFor));

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

  async function advance(stage: Stage, explicitDate?: string) {
    setBusy(stage);
    setError(null);
    try {
      const body: Record<string, unknown> = { id: placement.id, stage };
      if (explicitDate) body.stageDate = explicitDate;
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update stage");
        return;
      }
      const ts = explicitDate || new Date().toISOString();
      const next: PlacementStepperData = { ...placement };
      if (stage === "scheduled") next.scheduledFor = ts;
      if (stage === "installed") next.installedAt = ts;
      if (stage === "live") next.liveFrom = ts;
      if (stage === "collected") { next.collectedAt = ts; next.status = "completed"; }
      onChange?.(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId: placement.id, action: "advance", stage } }));
      }
      setSchedulePickerOpen(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmSchedule() {
    if (!scheduleDraft) return;
    // Convert the picker's YYYY-MM-DD into an ISO datetime at midday
    // local time, so the saved timestamp lands on the intended calendar
    // day regardless of the viewer's timezone.
    const iso = new Date(`${scheduleDraft}T12:00:00`).toISOString();
    await advance("scheduled", iso);
  }

  // Next advanceable stage = first advanceable step without a timestamp.
  const nextAdvanceable = steps.find((s) => s.advanceable && !s.timestamp);
  const nextStage = nextAdvanceable ? (nextAdvanceable.key as Stage) : null;
  const showAdvance = canAdvance && nextStage && placement.status === "active";
  const hasSchedule = !!placement.scheduledFor;
  const canEditSchedule = canAdvance && placement.status === "active" && hasSchedule && !placement.installedAt;

  // Most-recent advanceable stage that has a timestamp = what Undo
  // should pull back. Requested + Accepted aren't advanceable so they're
  // never undo targets, those are decisions, not stage marks.
  const lastReached = [...steps].reverse().find((s) => s.advanceable && !!s.timestamp);
  const lastReachedStage = lastReached ? (lastReached.key as Stage) : null;
  const showUndo = canAdvance && !!lastReachedStage && (placement.status === "active" || placement.status === "completed");

  async function undoStage(stage: Stage) {
    if (!confirm(`Undo "${stage}"? This clears the timestamp and lets you restamp it later.`)) return;
    setBusy(stage);
    setError(null);
    try {
      const res = await authFetch("/api/placements", {
        method: "PATCH",
        body: JSON.stringify({ id: placement.id, unsetStage: stage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not undo stage");
        return;
      }
      const next: PlacementStepperData = { ...placement };
      if (stage === "scheduled") next.scheduledFor = null;
      if (stage === "installed") next.installedAt = null;
      if (stage === "live") next.liveFrom = null;
      if (stage === "collected") { next.collectedAt = null; next.status = "active"; }
      onChange?.(next);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("wallplace:placement-changed", { detail: { placementId: placement.id, action: "undo", stage } }));
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

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
        const isScheduling = nextStage === "scheduled";
        return (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            {isScheduling ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSchedulePickerOpen((v) => !v); setError(null); }}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors disabled:opacity-60"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Schedule install
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); advance(nextStage); }}
                disabled={busy !== null}
                className="px-3.5 py-1.5 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors disabled:opacity-60 inline-flex items-center gap-1.5"
              >
                {busy === nextStage ? (
                  <>
                    <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" opacity="0.4" />
                      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Marking {label.toLowerCase()}…
                  </>
                ) : `Mark ${label}`}
              </button>
            )}
            {showUndo && lastReachedStage && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); undoStage(lastReachedStage); }}
                disabled={busy !== null}
                className="px-3 py-1.5 text-xs font-medium text-muted bg-background border border-border hover:text-foreground hover:border-foreground/30 rounded-sm transition-colors disabled:opacity-60"
                title={`Undo ${lastReachedStage}`}
              >
                Undo {lastReachedStage}
              </button>
            )}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        );
      })()}
      {/* Undo also surfaces when there's no further stage to advance, e.g.
          after marking Collected, the user might realise it was premature
          and want to roll back. */}
      {!showAdvance && showUndo && lastReachedStage && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); undoStage(lastReachedStage); }}
            disabled={busy !== null}
            className="px-3 py-1.5 text-xs font-medium text-muted bg-background border border-border hover:text-foreground hover:border-foreground/30 rounded-sm transition-colors disabled:opacity-60"
          >
            Undo {lastReachedStage}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
      {/* Let the user revise the install date once set, as long as
          install hasn't happened yet. */}
      {canEditSchedule && !schedulePickerOpen && (
        <div className="mt-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSchedulePickerOpen(true); }}
            className="text-[11px] text-muted hover:text-accent transition-colors"
          >
            Change install date
          </button>
        </div>
      )}
      {schedulePickerOpen && (
        <div className="mt-2 flex items-center gap-2 flex-wrap bg-surface border border-border rounded-sm px-3 py-2">
          <label className="text-xs text-muted">Install date</label>
          <input
            type="date"
            value={scheduleDraft}
            onChange={(e) => setScheduleDraft(e.target.value)}
            min={isoDateToInput(new Date().toISOString())}
            className="px-2 py-1 bg-background border border-border rounded-sm text-xs focus:outline-none focus:border-accent/60"
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); confirmSchedule(); }}
            disabled={!scheduleDraft || busy !== null}
            className="px-3 py-1 text-xs font-medium text-accent bg-accent/5 border border-accent/30 hover:bg-accent/10 rounded-sm transition-colors disabled:opacity-60"
          >
            {busy === "scheduled" ? (
              <>
                <svg className="animate-spin inline-block mr-1.5" width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" opacity="0.4" />
                  <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Saving…
              </>
            ) : hasSchedule ? "Update date" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSchedulePickerOpen(false); }}
            className="text-[11px] text-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
