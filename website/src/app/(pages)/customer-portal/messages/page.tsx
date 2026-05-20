"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CustomerPortalLayout from "@/components/CustomerPortalLayout";
import MessageInbox from "@/components/MessageInbox";
import { useAuth } from "@/context/AuthContext";
import { slugify } from "@/lib/slugify";

function CustomerMessagesContent() {
  const { user, displayName } = useAuth();
  const searchParams = useSearchParams();

  const userSlug = displayName ? slugify(displayName) : user?.email?.split("@")[0] || "customer";
  const initialArtistSlug = searchParams.get("artist") || undefined;
  const initialArtistName = searchParams.get("artistName") || undefined;

  return (
    <CustomerPortalLayout>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Messages</h1>
        <p className="text-sm text-muted mt-1">Conversations with artists</p>
      </div>
      <MessageInbox
        userSlug={userSlug}
        portalType="customer"
        initialArtistSlug={initialArtistSlug}
        initialArtistName={initialArtistName}
      />
    </CustomerPortalLayout>
  );
}

export default function CustomerMessagesPage() {
  return (
    <Suspense fallback={<CustomerPortalLayout><p className="text-muted text-sm py-12 text-center">Loading...</p></CustomerPortalLayout>}>
      <CustomerMessagesContent />
    </Suspense>
  );
}
