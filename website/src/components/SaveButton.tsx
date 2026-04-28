"use client";

import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSaved } from "@/context/SavedContext";
import { useToast } from "@/context/ToastContext";

interface SaveButtonProps {
  type: "work" | "collection" | "artist";
  itemId: string;
  size?: "sm" | "md";
  className?: string;
}

export default function SaveButton({ type, itemId, size = "sm", className = "" }: SaveButtonProps) {
  const { user } = useAuth();
  const { toggleSaved, isSaved } = useSaved();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const saved = isSaved(type, itemId);

  const dim = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  const iconSize = size === "sm" ? 16 : 20;

  // Logged-out shoppers used to save to localStorage; product call (#14)
  // is to require an account first so saves are durable + not tied to a
  // shared browser. Bounce them to customer signup with `next` set to
  // wherever they were so the heart "completes" after auth.
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      const next = pathname || "/browse";
      showToast("Create an account to save favourites");
      router.push(`/signup/customer?next=${encodeURIComponent(next)}`);
      return;
    }
    toggleSaved(type, itemId);
  };

  return (
    <button
      onClick={handleClick}
      className={`${dim} rounded-full flex items-center justify-center transition-all ${
        saved
          ? "bg-accent text-white"
          : "bg-white/80 text-foreground/60 hover:bg-white hover:text-accent backdrop-blur-sm"
      } ${className}`}
      title={!user ? "Sign up to save" : saved ? "Remove from saved" : "Save"}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </button>
  );
}
