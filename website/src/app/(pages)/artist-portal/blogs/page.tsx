"use client";

// Phase 2.7 I1: artist's blog list. Lists every blog this artist
// owns regardless of status so they can resume drafts or see what's
// pending review.

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { authFetch } from "@/lib/api-client";
import { isFlagOn } from "@/lib/feature-flags";

interface BlogRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  created_at: string;
  published_at: string | null;
  /** Migration 128. Why an admin rejected it, so the badge is not the whole story. */
  rejection_reason?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
};

function statusBadge(status: string): string {
  switch (status) {
    case "published": return "bg-green-50 text-green-700 border-green-200";
    case "pending_review": return "bg-amber-50 text-amber-700 border-amber-200";
    case "rejected": return "bg-red-50 text-red-700 border-red-200";
    case "draft": return "bg-neutral-100 text-neutral-700 border-neutral-200";
    default: return "bg-neutral-100 text-neutral-700 border-neutral-200";
  }
}

export default function ArtistBlogsPage() {
  // bug-12: gate the whole surface on BLOGS_V1, which is off in prod. notFound()
  // works from a client component too (it throws the not-found signal the route
  // boundary catches); isFlagOn is client-safe via the CLIENT_ENV snapshot.
  if (!isFlagOn("BLOGS_V1")) notFound();
  const [rows, setRows] = useState<BlogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/blogs/mine");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRows(data.blogs ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ArtistPortalLayout activePath="/artist-portal/blogs">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif">My blogs</h1>
            <p className="text-sm text-muted mt-1">
              Drafts, pending review and live posts. Drafts stay private to you.
            </p>
          </div>
          <Link
            href="/artist-portal/blogs/new"
            className="px-3 py-2 text-sm rounded-sm bg-accent text-white hover:bg-accent-hover"
          >
            New blog
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">You haven&rsquo;t written anything yet.</p>
        ) : (
          <ul className="divide-y divide-border bg-surface border border-border rounded-sm">
            {rows.map((r) => (
              <li key={r.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <Link
                  href={`/artist-portal/blogs/${r.id}/edit`}
                  className="flex-1 min-w-0 hover:text-accent"
                >
                  <p className="text-sm font-medium truncate">{r.title || "(untitled)"}</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {r.published_at
                      ? `Published ${new Date(r.published_at).toLocaleDateString("en-GB")}`
                      : `Created ${new Date(r.created_at).toLocaleDateString("en-GB")}`}
                  </p>
                </Link>
                <span
                  className={`text-[11px] px-2 py-0.5 border rounded-full ${statusBadge(r.status)}`}
                >
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
                {/* Pass 2 item 3.2 (migration 128). A rejected post showed a
                    bare "Rejected" badge. The reason existed, in
                    admin_audit_log and on the moderation_queue row, neither of
                    which an artist can read, and the email carrying it was
                    eaten by the send throttle. */}
                {r.status === "rejected" && r.rejection_reason && (
                  <p className="basis-full text-xs text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2 mt-2">
                    <span className="font-medium">Why: </span>
                    {r.rejection_reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
