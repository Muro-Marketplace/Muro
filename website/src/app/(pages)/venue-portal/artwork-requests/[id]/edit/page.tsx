"use client";

// Venue edits an existing artwork request. Loads the row, hands the
// shared ArtworkRequestForm a prefilled `initial`, and submits via
// PATCH /api/artwork-requests/[id]. The detail page links here from
// its "Edit" button.

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";
import ArtworkRequestForm, {
  type ArtworkRequestInitial,
  type ArtworkRequestPayload,
} from "@/components/artwork-requests/ArtworkRequestForm";

interface RequestRow {
  id: string;
  title: string;
  description: string;
  intent: string[];
  styles: string[] | null;
  mediums: string[] | null;
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  location: string | null;
  timescale: string | null;
  qr_revenue_share_percent: number | null;
  visibility: string;
  invited_artist_slugs: string[] | null;
}

export default function EditArtworkRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [initial, setInitial] = useState<ArtworkRequestInitial | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await authFetch(`/api/artwork-requests/${id}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.request) {
          setError(data.error || "Could not load request.");
          return;
        }
        const r = data.request as RequestRow;
        // Map snake_case row → camelCase initial. Visibility values
        // older than the "no public" rule get coerced to semi_public
        // so the form renders something valid.
        setInitial({
          title: r.title,
          description: r.description,
          intent: (r.intent || []).filter((i): i is "purchase" | "commission" | "display" | "loan" =>
            i === "purchase" || i === "commission" || i === "display" || i === "loan",
          ),
          qrRevenueSharePercent: r.qr_revenue_share_percent,
          styles: r.styles || [],
          mediums: r.mediums || [],
          budgetMinPence: r.budget_min_pence,
          budgetMaxPence: r.budget_max_pence,
          location: r.location,
          timescale:
            r.timescale === "asap" || r.timescale === "weeks" || r.timescale === "months" || r.timescale === "flexible"
              ? r.timescale
              : null,
          visibility: r.visibility === "private" ? "private" : "semi_public",
          invitedArtistSlugs: r.invited_artist_slugs || [],
        });
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function submit(payload: ArtworkRequestPayload) {
    const res = await authFetch(`/api/artwork-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Could not save changes.");
    }
    router.push(`/venue-portal/artwork-requests/${id}`);
  }

  return (
    <VenuePortalLayout activePath="/venue-portal/artwork-requests">
      <div className="max-w-2xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-serif mb-2">Edit artwork request</h1>
        <p className="text-sm text-muted mb-6">
          Update the brief — open responses stay live and continue against the new terms.
        </p>
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        {loading || !initial ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <ArtworkRequestForm
            mode="edit"
            initial={initial}
            onSubmit={submit}
            onCancel={() => router.push(`/venue-portal/artwork-requests/${id}`)}
          />
        )}
      </div>
    </VenuePortalLayout>
  );
}
