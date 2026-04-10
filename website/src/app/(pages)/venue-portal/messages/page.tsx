"use client";

import VenuePortalLayout from "@/components/VenuePortalLayout";
import MessageInbox from "@/components/MessageInbox";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";
import { useAuth } from "@/context/AuthContext";
import { slugify } from "@/lib/slugify";

export default function VenueMessagesPage() {
  const { venue } = useCurrentVenue();
  const { displayName } = useAuth();

  const userSlug = venue?.slug || (displayName ? slugify(displayName) : "venue");

  return (
    <VenuePortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Messages</h1>
        <p className="text-sm text-muted mt-1">Conversations with artists</p>
      </div>
      <MessageInbox userSlug={userSlug} portalType="venue" />
    </VenuePortalLayout>
  );
}
