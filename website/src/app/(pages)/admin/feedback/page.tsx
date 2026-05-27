"use client";

// Phase 2.1 A6. Admin moderation panel for general feedback (read from
// moderation_queue where entity_type='feedback'). Read-only v1.

import { useEffect, useState } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await authFetch(
          `/api/admin/moderation?entity_type=feedback&status=${statusFilter}`,
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRows(data.rows || []);
        }
      } catch (err) {
        console.error("[admin/feedback load]", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [statusFilter]);

  return (
    <AdminPortalLayout activePath="/admin/feedback">
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
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminPortalLayout>
  );
}
