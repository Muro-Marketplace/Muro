"use client";

import VenuePortalLayout from "@/components/VenuePortalLayout";
import OffersList from "@/components/offers/OffersList";
import { useAuth } from "@/context/AuthContext";

export default function VenueOffersPage() {
  const { user, loading } = useAuth();
  return (
    <VenuePortalLayout activePath="/venue-portal/offers">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-serif">My offers</h1>
          <p className="text-sm text-muted mt-1">Track every offer you&rsquo;ve made on Wallplace artwork.</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : user ? (
          <OffersList viewerUserId={user.id} filter="buyer" />
        ) : (
          <p className="text-sm text-muted">Sign in to view your offers.</p>
        )}
      </div>
    </VenuePortalLayout>
  );
}
