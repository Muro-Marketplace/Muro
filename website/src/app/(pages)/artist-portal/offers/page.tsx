"use client";

import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import OffersList from "@/components/offers/OffersList";
import { useAuth } from "@/context/AuthContext";

export default function ArtistOffersPage() {
  const { user, loading } = useAuth();
  return (
    <ArtistPortalLayout activePath="/artist-portal/offers">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-serif">Offers received</h1>
          <p className="text-sm text-muted mt-1">Venues offering to buy your work. Accept, decline, or counter — your call.</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : user ? (
          <OffersList viewerUserId={user.id} filter="artist" />
        ) : (
          <p className="text-sm text-muted">Sign in to view your offers.</p>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
