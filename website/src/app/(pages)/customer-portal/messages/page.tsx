"use client";

// F15/H8: this page used to render the full MessageInbox with a
// client-side slug invented from the display name. The messages API
// rejects customer accounts (403), so the inbox sat permanently empty
// while looking functional, and the compose view accepted a message
// that could never send. For MVP, customer messaging is not built:
// enquiries go through the artist profile's enquiry form and artists
// reply by email. This page now says exactly that instead of
// pretending to be an inbox.

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import EmptyState from "@/components/EmptyState";

function CustomerMessagesContent() {
  const searchParams = useSearchParams();
  // Old "Message the artist" funnels arrived here with ?artist=<slug>.
  // Honour those links by pointing straight at that artist's enquiry
  // form rather than dropping the visitor on a generic explainer.
  const artistSlug = searchParams.get("artist");
  const artistName = searchParams.get("artistName");

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Messages</h1>
        <p className="text-sm text-muted mt-1">How contacting artists works</p>
      </div>
      <div className="border border-border rounded-2xl bg-surface shadow-sm">
        <EmptyState
          icon={
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          title="Artists reply to you by email"
          hint="There is no customer inbox on Wallplace yet. To contact an artist, send an enquiry from their profile page and they will reply to your email address."
          cta={
            artistSlug
              ? { label: `Contact ${artistName || artistSlug}`, href: `/browse/${artistSlug}?enquiry=1` }
              : { label: "Browse artists", href: "/browse" }
          }
          secondaryCta={artistSlug ? { label: "Browse all artists", href: "/browse" } : undefined}
        />
      </div>
    </>
  );
}

export default function CustomerMessagesPage() {
  return (
    <Suspense fallback={<><p className="text-muted text-sm py-12 text-center">Loading...</p></>}>
      <CustomerMessagesContent />
    </Suspense>
  );
}
