"use client";

// G27. Unified moderation queue. Flagged messages have landed in
// moderation_queue since migration 116 with no page listing them, so
// the abuse queue filled where nobody looked. This page lists every
// entity type in one place; the per-type panels (feature requests,
// feedback, blogs) stay as focused inboxes.
//
// Decisions: blog rows PATCH /api/admin/blogs/[id] (approving a blog
// also publishes it); everything else PATCHes /api/admin/moderation.

import { useState, useEffect, useCallback } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import type { ModerationPayload } from "@/lib/moderation/types";

interface QueueRow {
  id: string;
  entity_type: string;
  entity_id: string;
  submitted_by_user_id: string | null;
  submitted_by_email: string | null;
  status: string;
  decided_by_user_id: string | null;
  decided_at: string | null;
  reason: string | null;
  payload: ModerationPayload | null;
  created_at: string;
}

const ENTITY_TYPES = ["message", "blog", "feature_request", "feedback"] as const;
type EntityTab = "all" | (typeof ENTITY_TYPES)[number];

const ENTITY_TABS: { key: EntityTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "message", label: "Messages" },
  { key: "blog", label: "Blogs" },
  { key: "feature_request", label: "Feature requests" },
  { key: "feedback", label: "Feedback" },
];

const ENTITY_LABELS: Record<string, string> = {
  message: "Message",
  blog: "Blog",
  feature_request: "Feature request",
  feedback: "Feedback",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  edited: "Edited",
};

const STATUS_ORDER = ["pending", "approved", "rejected", "edited"] as const;
type StatusFilter = (typeof STATUS_ORDER)[number];

function statusBadge(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "approved":
      return "bg-green-100 text-green-700";
    case "rejected":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function rowTitle(r: QueueRow): string {
  const p = r.payload;
  if (!p) return "(unreadable payload)";
  switch (p.type) {
    case "message":
      return `Flagged message from ${p.sender_slug}`;
    case "blog":
      return p.title;
    case "feature_request":
      return p.title;
    case "feedback":
      return p.message;
  }
}

export default function AdminModerationPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [entityTab, setEntityTab] = useState<EntityTab>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The list endpoint filters by a single entity_type, so the All tab
      // fans out one request per type and merges, newest first.
      const types = entityTab === "all" ? ENTITY_TYPES : [entityTab];
      const responses = await Promise.all(
        types.map((t) =>
          authFetch(`/api/admin/moderation?entity_type=${t}&status=${statusFilter}`),
        ),
      );
      const merged: QueueRow[] = [];
      for (const res of responses) {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Could not load the queue");
          return;
        }
        merged.push(...(data.rows || []));
      }
      merged.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setRows(merged);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [entityTab, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(r: QueueRow, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      if (r.entity_type === "blog") {
        reason = prompt("Reason (visible to the author):") ?? undefined;
        if (!reason) return;
      } else {
        const input = prompt("Reason (kept on the queue row, optional):");
        if (input === null) return;
        reason = input.trim() || undefined;
      }
    }
    setSavingId(r.id);
    setError(null);
    setActionMsg(null);
    try {
      if (r.entity_type === "blog") {
        await mutate(`/api/admin/blogs/${r.entity_id}`, {
          method: "PATCH",
          body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
        });
      } else {
        await mutate("/api/admin/moderation", {
          method: "PATCH",
          body: JSON.stringify({ id: r.id, action, ...(reason ? { reason } : {}) }),
        });
      }
      setActionMsg(action === "approve" ? "Approved." : "Rejected.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code || "Could not apply that action."
          : "Network error. Please try again.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminPortalLayout activePath="/admin/moderation">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl text-foreground mb-1">Moderation queue</h1>
          <p className="text-sm text-muted">
            Everything waiting for a decision: flagged messages, blogs, feature requests and feedback.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface rounded-sm transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-end justify-between gap-4 mb-6 border-b border-border">
        <div className="flex gap-1" role="tablist">
          {ENTITY_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setEntityTab(t.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                entityTab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
              role="tab"
              aria-selected={entityTab === t.key}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="pb-2">
          <label htmlFor="moderation-status-filter" className="sr-only">Status</label>
          <select
            id="moderation-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 bg-white border border-border rounded-sm text-xs cursor-pointer focus:outline-none focus:border-accent/60"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {actionMsg && (
        <p className="text-sm text-foreground bg-accent/5 border border-accent/20 px-3 py-2 rounded-sm mb-4">
          {actionMsg}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-sm p-8 text-center text-sm text-muted">
          Nothing {STATUS_LABELS[statusFilter].toLowerCase()} in the queue.
        </div>
      ) : (
        <div className="bg-white border border-border rounded-sm divide-y divide-border">
          {rows.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                  className="w-full px-4 sm:px-5 py-3.5 flex items-center gap-4 text-left hover:bg-background/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-muted border border-border px-2 py-0.5 rounded-sm">
                        {ENTITY_LABELS[r.entity_type] || r.entity_type}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">
                        {rowTitle(r)}
                      </span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 truncate">
                      {r.submitted_by_email || "Unknown submitter"}
                      {r.payload?.type === "message" ? ` · ${r.payload.flag_reason}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted">
                      {new Date(r.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 sm:px-5 py-4 bg-background border-t border-border space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <Field
                        label="Submitted by"
                        value={r.submitted_by_email || ""}
                        href={r.submitted_by_email ? `mailto:${r.submitted_by_email}` : undefined}
                      />
                      <Field label="Submitted" value={new Date(r.created_at).toLocaleString("en-GB")} />
                      <Field
                        label="Decided"
                        value={r.decided_at ? new Date(r.decided_at).toLocaleString("en-GB") : ""}
                      />
                    </div>

                    {r.reason && <Block label="Reason" body={r.reason} />}

                    <PayloadDetail payload={r.payload} />

                    {r.status === "pending" && (
                      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                        <p className="text-[11px] text-muted">
                          {r.entity_type === "message"
                            ? "Approve marks the flag as reviewed and fine. Reject records the message as a violation. The message itself stays in the conversation."
                            : r.entity_type === "blog"
                              ? "Approving publishes the blog. Rejecting records the reason for the author."
                              : "Approve or reject to clear this from the pending queue."}
                        </p>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={savingId === r.id}
                            onClick={() => decide(r, "approve")}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={savingId === r.id}
                            onClick={() => decide(r, "reject")}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-sm transition-colors disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminPortalLayout>
  );
}

function PayloadDetail({ payload }: { payload: ModerationPayload | null }) {
  if (!payload) {
    return (
      <p className="text-xs text-muted">
        This row&apos;s payload could not be parsed, so only the queue metadata is shown.
      </p>
    );
  }
  switch (payload.type) {
    case "message":
      return (
        <>
          <Block label="Flagged message" body={payload.excerpt} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <Field label="Flagged for" value={payload.flag_reason} />
            <Field label="Sender" value={payload.sender_slug} />
            <Field label="Recipient" value={payload.recipient_slug} />
            <Field label="Conversation" value={payload.conversation_id} />
            <Field label="Message id" value={payload.message_id} />
          </div>
        </>
      );
    case "blog":
      return (
        <>
          <Block label="Excerpt" body={payload.excerpt} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <Field label="Title" value={payload.title} />
            <Field label="Blog id" value={payload.blog_id} />
          </div>
        </>
      );
    case "feature_request":
      return (
        <>
          <Block label="Description" body={payload.description} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <Field
              label="Contact email"
              value={payload.contact_email || ""}
              href={payload.contact_email ? `mailto:${payload.contact_email}` : undefined}
            />
            <Field label="User agent" value={payload.user_agent || ""} />
          </div>
        </>
      );
    case "feedback":
      return (
        <>
          <Block label="Message" body={payload.message} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <Field label="Rating" value={payload.rating ? `${payload.rating} of 5` : ""} />
            <Field label="Page" value={payload.source_url || ""} />
            <Field
              label="Contact email"
              value={payload.contact_email || ""}
              href={payload.contact_email ? `mailto:${payload.contact_email}` : undefined}
            />
            <Field label="User agent" value={payload.user_agent || ""} />
          </div>
        </>
      );
  }
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      {href ? (
        <a href={href} className="text-xs text-accent hover:underline">{value}</a>
      ) : (
        <p className="text-xs text-foreground break-all">{value}</p>
      )}
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="bg-white border border-border rounded-sm p-3">
      <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xs text-foreground whitespace-pre-wrap">{body}</p>
    </div>
  );
}
