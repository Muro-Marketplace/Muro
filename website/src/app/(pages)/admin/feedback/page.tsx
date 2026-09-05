"use client";

// Phase 2.1 A6. Admin moderation panel for general feedback (read from
// moderation_queue where entity_type='feedback').
//
// G26: the same dead-tab defect as the feature-request inbox. Nothing wrote to
// entity_type='feedback' queue rows, so Approved and Rejected were permanently
// empty and there was no way to clear what had been read. These controls call
// the shared PATCH on /api/admin/moderation.

import { useCallback, useEffect, useState } from "react";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import type { ModerationPayload } from "@/lib/moderation/types";

interface QueueRow {
  id: string;
  entity_id: string;
  submitted_by_email: string | null;
  status: string;
  payload: ModerationPayload | null;
  created_at: string;
}

export default function FeedbackAdminPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/admin/moderation?entity_type=feedback&status=${statusFilter}`,
      );
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows || []);
      }
    } catch (err) {
      console.error("[admin/feedback load]", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Triage only. "Approve" here means read and kept, "Reject" means read and
  // dismissed; neither writes to the person who sent it.
  async function decide(r: QueueRow, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = prompt("Reason (kept on the queue row, optional):");
      if (input === null) return;
      reason = input.trim() || undefined;
    }
    setSavingId(r.id);
    setActionMsg(null);
    try {
      await mutate("/api/admin/moderation", {
        method: "PATCH",
        body: JSON.stringify({ id: r.id, action, ...(reason ? { reason } : {}) }),
      });
      setActionMsg(action === "approve" ? "Approved." : "Rejected.");
      await load();
    } catch (err) {
      setActionMsg(
        err instanceof ApiError
          ? err.code || "Could not apply that action."
          : "Network error. Please try again.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <div className="max-w-4xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl mb-2">Feedback</h1>
          <p className="text-sm text-muted">
            Submissions from the in-app feedback bubble (feedback tab).
          </p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-border" role="tablist">
          {(["pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${
                statusFilter === s
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
              role="tab"
              aria-selected={statusFilter === s}
            >
              {s}
            </button>
          ))}
        </div>

        {actionMsg && (
          <p className="text-sm text-foreground bg-accent/5 border border-accent/20 px-3 py-2 rounded-sm mb-4">
            {actionMsg}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No {statusFilter} feedback.</p>
        ) : (
          <ul className="divide-y divide-border bg-surface border border-border rounded-sm">
            {rows.map((r) => {
              const p = r.payload?.type === "feedback" ? r.payload : null;
              return (
                <li key={r.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {p?.rating && (
                        <span className="inline-flex items-center gap-0.5 text-amber-500">
                          {Array.from({ length: p.rating }).map((_, i) => (
                            <span key={i} aria-hidden>
                              ★
                            </span>
                          ))}
                          {Array.from({ length: 5 - p.rating }).map((_, i) => (
                            <span key={`empty-${i}`} className="text-muted/40" aria-hidden>
                              ★
                            </span>
                          ))}
                          <span className="sr-only">{p.rating} of 5 stars</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap mb-3">
                    {p?.message || "(no message)"}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    {(p?.contact_email || r.submitted_by_email) && (
                      <span>
                        from{" "}
                        <a
                          href={`mailto:${p?.contact_email || r.submitted_by_email}`}
                          className="text-accent hover:underline"
                        >
                          {p?.contact_email || r.submitted_by_email}
                        </a>
                      </span>
                    )}
                    {p?.source_url && <span>on {p.source_url}</span>}
                  </div>
                  {r.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={savingId === r.id}
                        onClick={() => decide(r, "approve")}
                        className="px-3 py-1 text-xs rounded-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={savingId === r.id}
                        onClick={() => decide(r, "reject")}
                        className="px-3 py-1 text-xs rounded-sm border border-border hover:border-accent/40 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
