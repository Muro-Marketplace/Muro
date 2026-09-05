"use client";

import { useSearchParams } from "next/navigation";
import MessageInbox from "@/components/MessageInbox";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";

export default function ArtistMessagesPage() {
  const { artist, loading } = useCurrentArtist();
  const searchParams = useSearchParams();

  if (loading) {
    return <><p className="text-muted text-sm py-12 text-center">Loading...</p></>;
  }

  const userSlug = artist?.slug || "unknown";
  // QA 2026-08-30 bug 40: "Message this venue" on every venue page links here
  // with ?venue=&venueName= (VenueProfileApplyCta), but this page only read
  // ?artist=, so the parameters were dropped and the inbox opened on "Select a
  // conversation" with no composer. That is the primary artist-to-venue contact
  // route on the platform, and it is metered, so an artist could spend an
  // approach and land nowhere. The prop is the COUNTERPARTY slug regardless of
  // whether that party is an artist or a venue, so both spellings feed it.
  const initialArtistSlug =
    searchParams.get("venue") || searchParams.get("artist") || undefined;
  const initialArtistName =
    searchParams.get("venueName") || searchParams.get("artistName") || undefined;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Messages</h1>
        <p className="text-sm text-muted mt-1">Enquiries and conversations with venues and buyers</p>
      </div>
      <MessageInbox
        userSlug={userSlug}
        portalType="artist"
        initialArtistSlug={initialArtistSlug}
        initialArtistName={initialArtistName}
        works={artist?.works}
      />
    </>
  );
}
