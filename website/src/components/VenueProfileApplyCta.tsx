"use client";

/**
 * Header CTA on a venue profile.
 *
 * Behaviour by viewer:
 *   - Open requests on this venue → always show "View open artwork
 *     requests" anchored to the in-page section, because that's the
 *     immediate action regardless of who is looking.
 *   - Otherwise, signed-out visitor → "Apply to be displayed here"
 *     deep-links into the artist signup flow.
 *   - Otherwise, signed-in artist → "Message this venue" composer
 *     deep-link (an artist looking at a venue with no open call still
 *     wants a way to introduce themselves).
 *   - Otherwise, signed-in non-artist (venue / customer) → no CTA, the
 *     button doesn't make sense for them and previously made the page
 *     look stuck on a stale "Apply" call to action.
 *
 * Server component (page.tsx) renders this as an island so the page
 * itself stays prerenderable and auth-aware bits stay client-side.
 */

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

interface Props {
  venueSlug: string;
  venueName: string;
  hasOpenRequests: boolean;
}

export default function VenueProfileApplyCta({ venueSlug, venueName, hasOpenRequests }: Props) {
  const { user, userType, loading } = useAuth();

  if (hasOpenRequests) {
    return (
      <CtaLink href="#open-requests" label="View open artwork requests" />
    );
  }

  // While auth resolves, render nothing rather than flashing the
  // signed-out CTA only to swap it a moment later.
  if (loading) return null;

  if (!user) {
    return (
      <CtaLink href="/signup/artist" label="Apply to be displayed here" />
    );
  }

  if (userType === "artist") {
    const params = new URLSearchParams({ venue: venueSlug, venueName });
    return (
      <CtaLink
        href={`/artist-portal/messages?${params.toString()}`}
        label="Message this venue"
      />
    );
  }

  return null;
}

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white text-foreground text-sm font-medium rounded-sm hover:bg-white/90 transition-colors self-start sm:self-end"
    >
      {label}
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </Link>
  );
}
