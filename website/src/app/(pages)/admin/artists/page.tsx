"use client";

// G8. This was a read-only table with no moderation tooling: it did not show
// review_status, the column that decides whether an artist appears on the
// public marketplace at all, and it had no control that wrote anything, so
// taking a profile down meant editing the row in Supabase by hand.
//
// review_status is the real unpublish switch (anon RLS on artist_profiles
// exposes 'approved' rows only, and /api/browse-artists filters the same way),
// so the three controls here are the whole of it: approve one waiting at the
// gate, unpublish a live one with a reason the artist is emailed, and put a
// rejected one back.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch, mutate, ApiError } from "@/lib/api-client";

interface ArtistRow {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  primary_medium: string;
  location: string;
  review_status: string | null;
  approved_at: string | null;
  created_at: string;
}

type StatusTab = "all" | "approved" | "pending" | "rejected";

const TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "approved", label: "Live" },
  { key: "pending", label: "Awaiting review" },
  { key: "rejected", label: "Unpublished" },
];

const STATUS_LABELS: Record<string, string> = {
  approved: "Live",
  pending: "Awaiting review",
  rejected: "Unpublished",
};

function statusBadge(status: string): string {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-700";
    case "pending":
      return "bg-amber-100 text-amber-700";
    case "rejected":
      return "bg-red-100 text-red-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<StatusTab>("all");
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/artists");
      if (res.ok) {
        const data = await res.json();
        setArtists(data.artists || []);
      } else {
        setError("Could not load the artist list.");
      }
    } catch (err) {
      console.error("Failed to load artists:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Unpublishing hides a working artist from the marketplace and emails them
  // about it, so it asks twice: once for the reason (which is what the email
  // says), once to confirm.
  async function setReviewStatus(a: ArtistRow, reviewStatus: "approved" | "rejected") {
    let reason: string | undefined;
    if (reviewStatus === "rejected") {
      const input = prompt(
        `Why is ${a.name} being unpublished? This is emailed to them.`,
      );
      if (!input || !input.trim()) return;
      reason = input.trim();
      if (
        !window.confirm(
          `This hides ${a.name} from the public marketplace and emails them. Continue?`,
        )
      ) {
        return;
      }
    }

    setSavingId(a.id);
    setError(null);
    setActionMsg(null);
    try {
      await mutate("/api/admin/artists", {
        method: "PATCH",
        body: JSON.stringify({ id: a.id, reviewStatus, ...(reason ? { reason } : {}) }),
      });
      setActionMsg(
        reviewStatus === "rejected"
          ? `${a.name} is no longer on the marketplace.`
          : `${a.name} is live on the marketplace.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code || "Could not apply that change."
          : "Network error. Please try again.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const visible = artists.filter((a) => tab === "all" || (a.review_status ?? "pending") === tab);

  return (
    <AdminPortalLayout activePath="/admin/artists">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl mb-1">Registered Artists</h1>
          <p className="text-sm text-muted">
            Unpublishing hides a profile from the public marketplace. It does not touch their
            placements, orders or messages.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface rounded-sm transition-colors shrink-0"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
            role="tab"
            aria-selected={tab === t.key}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {actionMsg && (
        <p className="text-sm text-foreground bg-accent/5 border border-accent/20 px-3 py-2 rounded-sm mb-4">
          {actionMsg}
        </p>
      )}

      {loading ? (
        <p className="text-muted text-sm py-8 text-center">Loading artists...</p>
      ) : visible.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">
          {artists.length === 0 ? "No registered artists yet." : "No artists in this tab."}
        </p>
      ) : (
        <div className="bg-white border border-border rounded-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Name</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Status</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden sm:table-cell">Medium</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden lg:table-cell">Joined</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((artist) => {
                const status = artist.review_status ?? "pending";
                const busy = savingId === artist.id;
                return (
                  <tr key={artist.id} className="border-b border-border last:border-b-0 hover:bg-surface/30">
                    <td className="py-3 px-4 font-medium text-foreground">{artist.name}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusBadge(status)}`}>
                        {STATUS_LABELS[status] || status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted hidden sm:table-cell">{artist.primary_medium || "-"}</td>
                    <td className="py-3 px-4 text-muted hidden md:table-cell">{artist.location || "-"}</td>
                    <td className="py-3 px-4 text-muted hidden lg:table-cell">
                      {new Date(artist.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link href={`/browse/${artist.slug}`} className="text-accent hover:underline text-xs">
                          View
                        </Link>
                        {status === "approved" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setReviewStatus(artist, "rejected")}
                            className="text-xs text-red-600 hover:underline disabled:opacity-60"
                          >
                            Unpublish
                          </button>
                        ) : status === "rejected" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setReviewStatus(artist, "approved")}
                            className="text-xs text-accent hover:underline disabled:opacity-60"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setReviewStatus(artist, "approved")}
                            className="text-xs text-accent hover:underline disabled:opacity-60"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted mt-4">
        {visible.length} artist{visible.length !== 1 ? "s" : ""}
        {tab === "all" ? " registered" : " in this tab"}
      </p>
    </AdminPortalLayout>
  );
}
