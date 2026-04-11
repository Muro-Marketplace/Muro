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

  const baseStyles = "inline-flex items-center justify-center font-medium rounded-sm transition-colors";
  const sizeStyles = size === "lg" ? "px-7 py-3.5 text-sm" : "px-5 py-2.5 text-sm";
  const variantStyles = variant === "primary"
    ? "bg-foreground text-white hover:bg-foreground/90"
    : "bg-accent text-white hover:bg-accent-hover";

  function handleClick() {
    if (user && userType === "venue") {
      router.push(`/venue-portal/messages?artist=${artistSlug}`);
    } else if (user && userType === "artist") {
      router.push(`/artist-portal/messages?artist=${artistSlug}`);
    } else {
      router.push(`/contact?artist=${artistSlug}`);
    }
  }

  return (
    <button onClick={handleClick} className={`${baseStyles} ${sizeStyles} ${variantStyles}`}>
      Message {artistName || "This Artist"}
    </button>
  );
}
