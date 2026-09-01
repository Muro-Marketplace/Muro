"use client";

import { useSearchParams } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import MessageInbox from "@/components/MessageInbox";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";

export default function VenueMessagesPage() {
  const { venue, loading, refetch } = useCurrentVenue();
  const searchParams = useSearchParams();

  const initialArtistSlug = searchParams.get("artist") || undefined;
  const initialArtistName = searchParams.get("artistName") || undefined;

  const header = (
    <div className="mb-6">
      <h1 className="text-2xl lg:text-3xl">Messages</h1>
      <p className="text-sm text-muted mt-1">Conversations with artists</p>
    </div>
  );

  // Wait for the venue profile to load so we have the correct slug.
  if (loading) {
    return (
      <VenuePortalLayout>
        {header}
        <p className="text-muted text-sm py-16 text-center">Loading messages...</p>
      </VenuePortalLayout>
    );
  }

  // E30. This used to be `loading || !venue?.slug`, which meant the "Loading
  // messages..." line was also the terminal state for a venue whose profile
  // never resolved: useCurrentVenue sets venue to null with loading false when
  // the API returns no row and the static fallback misses nothing, so the page
  // spun forever with no error, no retry and no way forward. The portal shell's
  // self-heal is what creates the missing profile row, so point at that and
  // give the user the same Retry affordance it has.
  if (!venue?.slug) {
    return (
      <VenuePortalLayout>
        {header}
        <div className="max-w-md mx-auto py-16 text-center">
          <p className="text-sm font-medium text-foreground mb-1">
            We couldn&rsquo;t load your venue profile
          </p>
          <p className="text-xs text-muted mb-4">
            Your messages are safe. This usually clears on a second attempt. If it keeps happening,
            open Venue Profile and finish setting it up.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 bg-accent text-white text-xs font-medium rounded-full hover:bg-accent-hover transition-colors"
          >
            Try again
          </button>
        </div>
      </VenuePortalLayout>
    );
  }

  return (
    <VenuePortalLayout>
      {header}
      <MessageInbox
        userSlug={venue.slug}
        portalType="venue"
        initialArtistSlug={initialArtistSlug}
        initialArtistName={initialArtistName}
      />
    </VenuePortalLayout>
  );
}
