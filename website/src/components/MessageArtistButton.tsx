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

  function handleClick() {
    const nameParam = artistName ? `&artistName=${encodeURIComponent(artistName)}` : "";
    if (user && userType === "venue") {
      router.push(`/venue-portal/messages?artist=${artistSlug}${nameParam}`);
    } else if (user && userType === "artist") {
      router.push(`/artist-portal/messages?artist=${artistSlug}${nameParam}`);
    } else if (user && userType === "customer") {
      router.push(`/customer-portal/messages?artist=${artistSlug}${nameParam}`);
    } else {
      // Logged-out path (#2). Was sending shoppers to /contact —
      // a one-shot enquiry form with no continuation, so an artist
      // who replied had nowhere to send the reply *to*. Now we send
      // them through customer signup and bounce them straight into
      // /customer-portal/messages with the same artist preselected,
      // so the conversation has somewhere to live.
      const next = `/customer-portal/messages?artist=${artistSlug}${nameParam}`;
      router.push(`/signup/customer?next=${encodeURIComponent(next)}`);
    }
  }

  return (
    <button onClick={handleClick} className={`${baseStyles} ${sizeStyles} ${variantStyles}`}>
      Message
    </button>
  );
}
