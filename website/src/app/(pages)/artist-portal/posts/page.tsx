"use client";

// Artist's social-post studio. Pick one of your works → generate an
// Instagram-ready post, story, or reel idea with a download/copy
// caption affordance.

import { useState, useEffect } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import InstagramPostGenerator from "@/components/social/InstagramPostGenerator";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";

interface ActivePlacement {
  workTitle?: string;
  venue?: string;
  status?: string;
}

export default function ArtistPostsPage() {
  const { artist, loading } = useCurrentArtist();
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [activePlacements, setActivePlacements] = useState<ActivePlacement[]>([]);

  useEffect(() => {
    authFetch("/api/placements?status=active")
      .then((r) => r.json())
      .then((d) => setActivePlacements(d.placements || []))
      .catch(() => setActivePlacements([]));
  }, []);

  if (loading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/posts">
        <p className="text-muted text-sm py-12 text-center">{loading ? "Loading…" : "No artist profile found."}</p>
      </ArtistPortalLayout>
    );
  }

  const works = artist.works || [];
  const selected = works[selectedIdx];

  // Match the selected work against any active placement to pre-fill
  // the "Now showing at" line.
  const showingAt = selected
    ? activePlacements.find((p) => (p.workTitle || "").toLowerCase() === selected.title.toLowerCase())?.venue
    : null;

  return (
    <ArtistPortalLayout activePath="/artist-portal/posts">
      <div className="max-w-5xl px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-serif">Social posts</h1>
          <p className="text-sm text-muted mt-1">Generate Instagram posts, stories, and reel ideas for your work in one click.</p>
        </div>

        {works.length === 0 ? (
          <p className="text-sm text-muted">Upload some work first and we&rsquo;ll generate posts for them here.</p>
        ) : (
          <div className="grid lg:grid-cols-[260px_1fr] gap-6">
            {/* Works picker */}
            <aside>
              <p className="text-[11px] uppercase tracking-wider text-muted mb-2">Pick a work</p>
              <ul className="space-y-2">
                {works.map((w, i) => (
                  <li key={w.id || w.title}>
                    <button
                      type="button"
                      onClick={() => setSelectedIdx(i)}
                      className={`w-full flex gap-3 items-center p-2 rounded-sm border text-left transition-colors ${
                        selectedIdx === i ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"
                      }`}
                    >
                      <div className="w-12 h-12 relative rounded-sm overflow-hidden bg-foreground/5 shrink-0">
                        {w.image && (
                          <Image src={w.image} alt={w.title} fill className="object-cover" sizes="48px" unoptimized />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{w.title}</p>
                        {w.medium && <p className="text-[11px] text-muted truncate">{w.medium}</p>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Generator */}
            <div>
              {selected ? (
                <InstagramPostGenerator
                  workTitle={selected.title}
                  artistName={artist.name}
                  artistSlug={artist.slug}
                  workImage={selected.image}
                  workMedium={selected.medium || null}
                  showingAtVenueName={showingAt || null}
                />
              ) : (
                <p className="text-sm text-muted">Pick a work from the list to start.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
