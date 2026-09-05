"use client";

// Phase 2.8 A2. Admin dispute list + light detail view.
//
// G17: the row used to print the literal string
// "GET /api/messages?dispute_id={id}" in a code tag and leave the admin to go
// and run it themselves. The admin-scoped branch of that endpoint has worked
// since Phase 2.8, audited read and all; nothing in the portal called it. It is
// a viewer now.
//
// G20: escalation no longer overwrites the dispute's category, so the heading
// shows the classification it was filed under plus a flag.

import { useEffect, useState, useCallback } from "react";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { baseCategory, isEscalated } from "@/app/api/admin/disputes/escalation";

interface DisputeMessage {
  id: string;
  sender_name: string | null;
  recipient_slug: string | null;
  content: string | null;
  created_at: string;
}

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
      // The resolution text is the body of the email both parties receive (or
      // the opener, on a dispute with no order). It was never internal, and
      // saying so invited notes that read like an internal ticket comment.
      const resolution = prompt("Outcome (emailed to everyone involved):");
      if (!resolution) return;
      body = { action, resolution };
    } else if (action === "escalate") {
      const note = prompt("Escalation note (optional):") ?? "";
      body = { action, note };
    }
    try {
      // Status + audit-log write only (no refund/payout on this route). mutate throws
      // on a non-2xx or a dropped request; the old code had no catch, so a network
      // failure rejected unhandled with no message.
      await mutate(`/api/admin/disputes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setActionMsg(`Dispute ${action}d.`);
      load();
    } catch (err) {
      setActionMsg(
        err instanceof ApiError
          ? err.code || "Could not apply action."
          : "Network error. Please try again.",
      );
    }
  }

  return (
    <>
      <div className="max-w-5xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl lg:text-3xl mb-2">Disputes</h1>
          <p className="text-sm text-muted">
            Customer / artist / venue disputes. Resolving emails everyone involved and writes to the audit log.
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
                    <h3 className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span>{baseCategory(d.category) || "Untitled dispute"}</span>
                      {isEscalated(d.category) && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-sm bg-amber-100 text-amber-700">
                          Escalated
                        </span>
                      )}
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
                {d.conversation_id && <DisputeThread disputeId={d.id} />}
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
    </>
  );
}

// G17. The dispute-scoped read is audited server-side on every call, so it is
// fetched on demand rather than for every row on load: opening the page should
// not write an admin_audit_log row per dispute for threads nobody looked at.
function DisputeThread({ disputeId }: { disputeId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisputeMessage[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (messages !== null || state === "loading") return;
    setState("loading");
    try {
      const res = await authFetch(`/api/messages?dispute_id=${encodeURIComponent(disputeId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        return;
      }
      setMessages((data.messages as DisputeMessage[]) ?? []);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mb-3">
      <button type="button" onClick={toggle} className="text-xs text-accent hover:underline">
        {open ? "Hide the conversation" : "Read the conversation"}
      </button>
      {open && (
        <div className="mt-2 bg-background/40 border border-border rounded-sm p-3 max-h-80 overflow-y-auto space-y-2">
          {state === "loading" && <p className="text-xs text-muted">Loading the conversation…</p>}
          {state === "error" && (
            <p className="text-xs text-red-600">
              Could not load the conversation. Try again before deciding on this case.
            </p>
          )}
          {state === "idle" && messages?.length === 0 && (
            <p className="text-xs text-muted">This conversation has no messages.</p>
          )}
          {state === "idle" &&
            messages?.map((m) => (
              <div key={m.id} className="bg-white border border-border rounded-sm px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
                  {m.sender_name || "unknown"}
                  {" · "}
                  {new Date(m.created_at).toLocaleString("en-GB")}
                </p>
                <p className="text-xs text-foreground whitespace-pre-wrap">{m.content || ""}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
