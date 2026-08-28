"use client";

// Phase 2.7 A4. Admin queue for pending blogs. Pulls
// moderation_queue rows where entity_type='blog' and status='pending'.
// Approve / reject actions PATCH /api/admin/blogs/[id].

import { useEffect, useState, useCallback } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
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

export default function AdminBlogsPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "edited">("pending");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(
        `/api/admin/moderation?entity_type=blog&status=${statusFilter}`,
      );
      if (res.ok) {
        const data = await res.json();
        setRows(data.rows ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleAction(
    blogId: string,
    action: "approve" | "reject",
  ) {
    let reason: string | undefined;
    if (action === "reject") {
      reason = prompt("Reason (visible to the author):") ?? undefined;
      if (!reason) return;
    }
    try {
      // mutate throws on a non-2xx (ApiError) or a dropped request. The old code had
      // no catch at all, so a network failure rejected unhandled and left the admin
      // with no message; both failure modes now land in one place.
      await mutate(`/api/admin/blogs/${blogId}`, {
        method: "PATCH",
        body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
      });
      setActionMsg(action === "approve" ? "Approved." : "Rejected.");
      load();
    } catch (err) {
      setActionMsg(
        err instanceof ApiError
          ? err.code || "Could not apply that action."
          : "Network error. Please try again.",
      );
    }
  }

  return (
    <AdminPortalLayout activePath="/admin/blogs">
      <div className="max-w-4xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl mb-2">Blogs</h1>
          <p className="text-sm text-muted">
            Author-submitted blogs awaiting review.
          </p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-border" role="tablist">
          {(["pending", "approved", "rejected", "edited"] as const).map((s) => (
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
          <p className="text-sm text-muted">No {statusFilter} blogs.</p>
        ) : (
          <ul className="divide-y divide-border bg-surface border border-border rounded-sm">
            {rows.map((r) => {
              const p = r.payload?.type === "blog" ? r.payload : null;
              return (
                <li key={r.id} className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-base font-medium">{p?.title || "(no title)"}</h3>
                    <span className="text-[11px] text-muted whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap mb-3">
                    {p?.excerpt || "(no excerpt)"}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
                    {r.submitted_by_email && (
                      <span>
                        from{" "}
                        <a
                          href={`mailto:${r.submitted_by_email}`}
                          className="text-accent hover:underline"
                        >
                          {r.submitted_by_email}
                        </a>
                      </span>
                    )}
                  </div>
                  {statusFilter === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleAction(r.entity_id, "approve")}
                        className="px-3 py-1 text-xs rounded-sm bg-accent text-white hover:bg-accent-hover"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(r.entity_id, "reject")}
                        className="px-3 py-1 text-xs rounded-sm border border-border hover:border-accent/40"
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
    </AdminPortalLayout>
  );
}
