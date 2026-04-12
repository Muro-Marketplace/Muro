"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function VenueArtistToggle() {
  const pathname = usePathname();
  const isVenues = pathname === "/venues" || pathname === "/how-it-works";
  const isArtists = pathname === "/artists";

  return (
    <div className="absolute top-20 lg:top-24 left-1/2 -translate-x-1/2 z-30">
      <div className="flex items-center gap-1 bg-black/40 backdrop-blur-md rounded-full p-1">
        <Link
          href="/venues"
          className={`px-5 py-2 text-xs font-medium rounded-full transition-colors ${
            isVenues ? "bg-white text-foreground" : "text-white/70 hover:text-white"
          }`}
        >
          For Venues
        </Link>
        <Link
          href="/artists"
          className={`px-5 py-2 text-xs font-medium rounded-full transition-colors ${
            isArtists ? "bg-white text-foreground" : "text-white/70 hover:text-white"
          }`}
        >
          For Artists
        </Link>
      </div>
    </div>
  );
}
