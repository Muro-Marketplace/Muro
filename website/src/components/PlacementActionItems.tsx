"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/api-client";
import { canRespond } from "@/lib/placement-permissions";

interface PlacementRow {
  id: string;
  artist_slug?: string;
  venue_slug?: string;
  venue?: string;
  work_title?: string;
  status?: string;
  requester_user_id?: string | null;
  artist_user_id?: string | null;
  venue_user_id?: string | null;
  accepted_at?: string | null;
  scheduled_for?: string | null;
  installed_at?: string | null;
  live_from?: string | null;
  collected_at?: string | null;
}

interface ActionItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  cta: string;
  severity: "todo" | "waiting" | "info";
}

function nameFrom(slug: string | undefined): string {
  if (!slug) return "";
  return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/**
 * Placement Action Items, unified next-action list for both venues and
 * artists. Shows what needs a response, a scheduled date, an install
 * confirmation, or a collection. The component fetches /api/placements
 * itself and filters against the given user role so it can be dropped
 * into any dashboard or placements page without plumbing state through.
 *
 * Renders nothing when there are no outstanding items, so it's safe to
 * include on quiet dashboards.
 */
export default function PlacementActionItems({
  userId,
  role,
  heading = "Action items",
  maxItems = 5,
}: {
  userId: string | null | undefined;
  role: "artist" | "venue";
  heading?: string;
  /** How many items to show in the collapsed state. "View all" toggles
      to the full list, there's no hard cap on how many the component
      will surface in total. */
  maxItems?: number;
}) {
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userId) { setItems([]); return; }
    authFetch("/api/placements")
      .then((r) => r.json())
      .then((data) => {
        const rows: PlacementRow[] = data.placements || [];
        const out: ActionItem[] = [];
        for (const p of rows) {
          const otherName = role === "venue" ? nameFrom(p.artist_slug) : (p.venue || nameFrom(p.venue_slug));
          const work = p.work_title || "a placement";
          const href = `/placements/${encodeURIComponent(p.id)}`;
          const status = (p.status || "").toLowerCase();

          // Pending, only surface if the current viewer can actually
          // respond. canRespond() checks requester_user_id and falls back
          // to the legacy venue-creates-artist-accepts model for rows
          // created before migration 008, so users don't see "Respond"
          // prompts for requests they themselves sent.
          if (status === "pending") {
            if (!canRespond(p, userId, role)) continue;
            out.push({
              id: `${p.id}-pending-act`,
              title: `Respond to ${otherName}'s placement request`,
              subtitle: work,
              href,
              cta: "Respond",
              severity: "todo",
            });
            continue;
          }

          if (status === "active") {
            if (!p.scheduled_for) {
              out.push({
                id: `${p.id}-schedule`,
                title: `Schedule installation with ${otherName}`,
                subtitle: work,
                href,
                cta: "Schedule",
                severity: "todo",
              });
            } else if (!p.installed_at) {
              out.push({
                id: `${p.id}-install`,
                title: `Confirm ${work} is installed`,
                subtitle: `with ${otherName}`,
                href,
                cta: "Mark installed",
                severity: "todo",
              });
            } else if (!p.live_from) {
              out.push({
                id: `${p.id}-live`,
                title: `Mark ${work} live on wall`,
                subtitle: `with ${otherName}`,
                href,
                cta: "Mark live",
                severity: "todo",
              });
            }
            // If all four timestamps are set, placement is in "live" steady
            // state, no action needed until collection.
          }
        }

        // Keep the full list in state, the render phase decides how
        // many to show based on the expanded toggle.
        setItems(out);
      })
      .catch(() => setItems([]));
  }, [userId, role]);

  if (items === null) return null; // loading, don't flicker
  if (items.length === 0) return null; // nothing to do, quiet dashboard

  const visibleItems = expanded ? items : items.slice(0, maxItems);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className="bg-surface border border-border rounded-sm p-5 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-medium text-foreground flex items-center gap-2">
          {heading}
          <span className="text-[10px] px-1.5 py-0.5 bg-accent text-white rounded-full">{items.length}</span>
        </h2>
        {items.length > maxItems && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted hover:text-foreground underline"
          >
            {expanded ? "Show less" : `View all (${items.length})`}
          </button>
        )}
      </div>
      <ul className="space-y-2">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-sm border border-border hover:border-accent/50 hover:bg-accent/5 transition-colors group"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                item.severity === "todo" ? "bg-accent" :
                item.severity === "waiting" ? "bg-amber-400" :
                "bg-border"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                {item.subtitle && <p className="text-xs text-muted truncate">{item.subtitle}</p>}
              </div>
              <span className="text-xs text-accent group-hover:translate-x-0.5 transition-transform shrink-0">
                {item.cta} →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full text-center text-xs text-muted hover:text-foreground transition-colors"
        >
          + {hiddenCount} more
        </button>
      )}
    </div>
  );
}
