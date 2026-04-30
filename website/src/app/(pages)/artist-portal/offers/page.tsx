"use client";

import { useEffect } from "react";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import OffersList from "@/components/offers/OffersList";
import { useAuth } from "@/context/AuthContext";

export default function ArtistOffersPage() {
  const { user, loading } = useAuth();

  // Email CTA → signed-out lands here → bounce to login with `next`
  // so they land back on the offers page after sign-in.
  useEffect(() => {
    if (loading || user) return;
    if (typeof window === "undefined") return;
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }, [loading, user]);

  return (
    <ArtistPortalLayout activePath="/artist-portal/offers">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-serif">Offers received</h1>
          <p className="text-sm text-muted mt-1">Venues offering to buy your work. Accept, decline, or counter — your call.</p>
        </div>
        {loading || !user ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <OffersList viewerUserId={user.id} filter="artist" />
        )}
      </div>
    </ArtistPortalLayout>
  );
}
