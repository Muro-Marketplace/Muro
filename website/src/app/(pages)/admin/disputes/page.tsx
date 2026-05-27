"use client";

// Phase 2.8 A2. Admin dispute list + light detail view.

import { useEffect, useState, useCallback } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

interface Dispute {
  id: string;
  opener_user_id: string;
  conversation_id: string | null;
  order_id: string | null;
  placement_id: string | null;
  status: string;
  category: string | null;
  description: string;
  resolution: string | null;
  created_at: string;
}

export default function AdminDisputesPage() {
  const [rows, setRows] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "closed">("open");
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/admin/disputes?status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.disputes ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);
  useEffect(() => { load(); }, [load]);

  async function handleAction(id: string, action: "resolve" | "close" | "escalate") {
    let body: Record<string, unknown> = { action };
    if (action === "resolve") {
      const resolution = prompt("Resolution note (visible internally):");
      if (!resolution) return;
      body = { action, resolution };
    } else if (action === "escalate") {
      const note = prompt("Escalation note (optional):") ?? "";
      body = { action, note };
    }
    const res = await authFetch(`/api/admin/disputes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setActionMsg(`Dispute ${action}d.`);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setActionMsg(data?.error || "Could not apply action.");
    }
  }

  return (
    <AdminPortalLayout activePath="/admin/disputes">
      <div className="max-w-5xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl mb-2">Disputes</h1>
          <p className="text-sm text-muted">
            Customer / artist / venue disputes. Resolving writes to the audit log.
          </p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-border" role="tablist">
          {(["open", "resolved", "closed"] as const).map((s) => (
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
          <p className="text-sm text-muted">No {statusFilter} disputes.</p>
        ) : (
          <ul className="divide-y divide-border bg-surface border border-border rounded-sm">
            {rows.map((d) => (
              <li key={d.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-sm font-medium">
                      {d.category ? d.category : "Untitled dispute"}
                    </h3>
                    <p className="text-[11px] text-muted">
                      Filed {new Date(d.created_at).toLocaleDateString("en-GB")}
                      {d.order_id ? ` · Order ${d.order_id}` : ""}
                      {d.placement_id ? ` · Placement ${d.placement_id}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted whitespace-nowrap">
                    {d.id.slice(0, 8)}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap mb-3">
                  {d.description}
                </p>
                {d.resolution && (
                  <p className="text-[11px] text-muted bg-background/40 px-2 py-1.5 rounded-sm mb-3">
                    Resolution: {d.resolution}
                  </p>
                )}
                {d.conversation_id && (
                  <p className="text-[11px] text-muted mb-3">
                    Read conversation:{" "}
                    <code className="bg-background/40 px-1 py-0.5 rounded-sm">
                      GET /api/messages?dispute_id={d.id}
                    </code>
                  </p>
                )}
                {statusFilter === "open" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(d.id, "resolve")}
                      className="px-3 py-1 text-xs rounded-sm bg-accent text-white hover:bg-accent-hover"
                    >
                      Resolve
                    </button>
                    <button
                      onClick={() => handleAction(d.id, "escalate")}
                      className="px-3 py-1 text-xs rounded-sm border border-border hover:border-accent/40"
                    >
                      Escalate
                    </button>
                    <button
                      onClick={() => handleAction(d.id, "close")}
                      className="px-3 py-1 text-xs rounded-sm border border-border hover:border-accent/40"
                    >
                      Close
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminPortalLayout>
  );
}
