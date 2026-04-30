"use client";

import { useEffect } from "react";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import OffersList from "@/components/offers/OffersList";
import { useAuth } from "@/context/AuthContext";

export default function VenueOffersPage() {
  const { user, loading } = useAuth();

  // When the user lands here from an email CTA while signed out, hand
  // them off to /login with a `next` so they bounce back here (with
  // any ?pay= param preserved). Earlier the page just rendered a
  // static "Sign in to view your offers" line and the user was stuck.
  useEffect(() => {
    if (loading || user) return;
    if (typeof window === "undefined") return;
    const next = window.location.pathname + window.location.search;
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }, [loading, user]);

  return (
    <VenuePortalLayout activePath="/venue-portal/offers">
      <div className="max-w-3xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-serif">My offers</h1>
          <p className="text-sm text-muted mt-1">Track every offer you&rsquo;ve made on Wallplace artwork.</p>
        </div>
        {loading || !user ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <OffersList viewerUserId={user.id} filter="buyer" />
        )}
      </div>
    </VenuePortalLayout>
  );
}
