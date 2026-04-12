"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

interface MessageArtistButtonProps {
  artistSlug: string;
  artistName: string;
  variant?: "accent" | "primary";
  size?: "md" | "lg";
}

export default function MessageArtistButton({ artistSlug, artistName, variant = "accent", size = "md" }: MessageArtistButtonProps) {
  const { user, userType } = useAuth();
  const router = useRouter();

  const baseStyles = "inline-flex items-center justify-center font-medium rounded-sm transition-colors min-w-[140px]";
  const sizeStyles = size === "lg" ? "px-8 py-3.5 text-sm font-semibold min-w-[200px]" : "px-5 py-2.5 text-sm";
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
      router.push(`/contact?artist=${artistSlug}`);
    }
  }

  return (
    <button onClick={handleClick} className={`${baseStyles} ${sizeStyles} ${variantStyles}`}>
      Message
    </button>
  );
}
