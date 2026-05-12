"use client";

// Public feature-request board. Anyone can submit; signed-in users
// can upvote.

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

interface Request {
  id: string;
  title: string;
  description: string;
  category: string | null;
  status: "open" | "planned" | "shipped" | "declined";
  upvotes: number;
  role: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<Request["status"], string> = {
  open: "Open",
  planned: "Planned",
  shipped: "Shipped",
  declined: "Closed",
};

const STATUS_BADGE: Record<Request["status"], string> = {
  open: "bg-foreground/5 text-foreground/70 border-border",
  planned: "bg-amber-50 text-amber-700 border-amber-200",
  shipped: "bg-emerald-50 text-emerald-700 border-emerald-200",
  declined: "bg-foreground/5 text-foreground/40 border-border",
};

export default function FeatureRequestsPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Request["status"]>("open");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feature-requests?status=${filter}`);
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Title and description are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feature-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || undefined,
          email: !user && email.trim() ? email.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      setTitle("");
      setDescription("");
      setCategory("");
      setEmail("");
      setTimeout(() => {
        setShowForm(false);
        setSubmitted(false);
        load();
      }, 1800);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(id: string) {
    if (!user) {
      window.location.href = `/login?next=${encodeURIComponent("/feature-requests")}`;
      return;
    }
    // Optimistic.
    setRequests((prev) => prev.map((r) => r.id === id ? { ...r, upvotes: r.upvotes + 1 } : r));
    try {
      const res = await authFetch(`/api/feature-requests/${id}/upvote`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        load();
        return;
      }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, upvotes: data.upvotes } : r));
    } catch {
      load();
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-start justify-between gap-6 mb-10">
        <div>
          <h1 className="text-3xl font-serif mb-2">Feature requests</h1>
          <p className="text-sm text-muted leading-relaxed">Tell us what would make Wallplace better. Vote for the ones you want most.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors shrink-0"
        >
          {showForm ? "Cancel" : "Submit idea"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-sm p-5 mb-10">
          {submitted ? (
            <div className="flex items-center gap-3 py-3 text-sm text-emerald-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Submitted. Thanks!
            </div>
          ) : (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title, what would you like?"
                maxLength={160}
                className="w-full px-3 py-2 mb-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell us more about the problem you're trying to solve."
                rows={4}
                maxLength={4000}
                className="w-full px-3 py-2 mb-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
              />
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Category (optional, e.g. messages)"
                  maxLength={40}
                  className="px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
                />
                {!user && (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (optional, for follow-up)"
                    maxLength={320}
                    className="px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
                  />
                )}
              </div>
              {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
              <button type="submit" disabled={submitting} className="mt-4 w-full sm:w-auto px-5 py-2 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-60">
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </>
          )}
        </form>
      )}

      <div className="flex gap-1 mb-6 border-b border-border">
        {(["open", "planned", "shipped", "declined"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
              filter === s ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-muted">No {STATUS_LABELS[filter].toLowerCase()} requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="bg-surface border border-border rounded-sm p-5 flex gap-4">
              <button
                type="button"
                onClick={() => handleUpvote(r.id)}
                className="flex flex-col items-center justify-center w-12 shrink-0 p-2 rounded-sm hover:bg-accent/5 transition-colors"
                title={user ? "Upvote" : "Sign in to upvote"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                  <polyline points="6 15 12 9 18 15" />
                </svg>
                <span className="text-sm font-medium mt-1">{r.upvotes}</span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-base font-medium text-foreground">{r.title}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${STATUS_BADGE[r.status]}`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                  {r.category && <span className="text-[10px] text-muted">· {r.category}</span>}
                </div>
                <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{r.description}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
