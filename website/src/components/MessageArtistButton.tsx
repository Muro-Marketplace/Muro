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

  // E2 (Phase 2.4): scope the CTA by viewer type.
  //   - Logged-out → existing "sign in to message" customer signup
  //     redirect.
  //   - Venue → existing "Message artist" behaviour.
  //   - Customer → "Contact Wallplace" link to /contact?artist=<slug>
  //     so the platform vets the enquiry instead of dumping a stranger
  //     into the artist's portal inbox.
  //   - Artist (viewing another artist) → hide entirely. The API path
  //     would 403 on send (E1) so the button has nothing useful to do.
  if (user && userType === "artist") {
    return null;
  }

  function handleClick() {
    const nameParam = artistName ? `&artistName=${encodeURIComponent(artistName)}` : "";
    if (user && userType === "venue") {
      router.push(`/venue-portal/messages?artist=${artistSlug}${nameParam}`);
    } else if (user && userType === "customer") {
      router.push(`/contact?artist=${encodeURIComponent(artistSlug)}`);
    } else {
      // Logged-out path (#2). Was sending shoppers to /contact,
      // a one-shot enquiry form with no continuation, so an artist
      // who replied had nowhere to send the reply *to*. Now we send
      // them through customer signup and bounce them straight into
      // /customer-portal/messages with the same artist preselected,
      // so the conversation has somewhere to live.
      const next = `/customer-portal/messages?artist=${artistSlug}${nameParam}`;
      router.push(`/signup/customer?next=${encodeURIComponent(next)}`);
    }
  }

  const label = user && userType === "customer" ? "Contact Wallplace" : "Message";

  return (
    <button onClick={handleClick} className={`${baseStyles} ${sizeStyles} ${variantStyles}`}>
      {label}
    </button>
  );
}
