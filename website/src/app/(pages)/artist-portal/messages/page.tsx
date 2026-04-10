"use client";

import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import MessageInbox from "@/components/MessageInbox";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";

export default function ArtistMessagesPage() {
  const { artist, loading } = useCurrentArtist();

  if (loading) {
    return <ArtistPortalLayout activePath="/artist-portal/messages"><p className="text-muted text-sm py-12 text-center">Loading...</p></ArtistPortalLayout>;
  }

  const userSlug = artist?.slug || "unknown";

  return (
    <ArtistPortalLayout activePath="/artist-portal/messages">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Messages</h1>
        <p className="text-sm text-muted mt-1">Enquiries and conversations with venues and buyers</p>
      </div>
      <MessageInbox userSlug={userSlug} portalType="artist" />
    </ArtistPortalLayout>
  );
}
