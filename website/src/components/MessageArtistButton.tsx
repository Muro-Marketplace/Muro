"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface MessageArtistButtonProps {
  artistSlug: string;
  artistName: string;
  variant?: "accent" | "primary";
  size?: "md" | "lg";
  /** When true, the button stretches to fill its parent and drops the
   *  default `min-width` so it doesn't blow out narrow columns. */
  fullWidth?: boolean;
}

export default function MessageArtistButton({ artistSlug, artistName, variant = "accent", size = "md", fullWidth = false }: MessageArtistButtonProps) {
  const { user, userType } = useAuth();
  const router = useRouter();

  const widthStyles = fullWidth ? "w-full" : "min-w-[140px]";
  const baseStyles = `inline-flex items-center justify-center font-medium rounded-sm transition-colors ${widthStyles}`;
  const sizeStyles = size === "lg"
    ? `px-8 py-3.5 text-sm font-semibold ${fullWidth ? "" : "min-w-[200px]"}`
    : "px-5 py-2 text-sm";
  const variantStyles = variant === "primary"
    ? "bg-foreground text-white hover:bg-foreground/90"
    : "bg-accent text-white hover:bg-accent-hover";

  // Scope the CTA by viewer type (E2, revised for B12/F17/H9):
  //   - Venue → existing portal "Message artist" behaviour.
  //   - Customer or logged-out → the profile's enquiry form
  //     (/browse/<slug>?enquiry=1). Customer accounts cannot use the
  //     messages API (it rejects users without an artist or venue
  //     profile), so the old routes, the customer-portal inbox and a
  //     signup redirect into that same inbox, both dead-ended after
  //     the visitor had typed a message. The enquiry form stores the
  //     enquiry and the artist replies by email, no account needed.
  //   - Artist (viewing another artist) → hide entirely. The API path
  //     would 403 on send (E1) so the button has nothing useful to do.
  if (user && userType === "artist") {
    return null;
  }

  function handleClick() {
    if (user && userType === "venue") {
      const nameParam = artistName ? `&artistName=${encodeURIComponent(artistName)}` : "";
      router.push(`/venue-portal/messages?artist=${artistSlug}${nameParam}`);
    } else {
      router.push(`/browse/${encodeURIComponent(artistSlug)}?enquiry=1`);
    }
  }

  return (
    <button onClick={handleClick} className={`${baseStyles} ${sizeStyles} ${variantStyles}`}>
      Message
    </button>
  );
}
