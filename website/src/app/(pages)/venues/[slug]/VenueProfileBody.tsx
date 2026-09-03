"use client";

import { useEffect, useState } from "react";
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";
import Image from "next/image";
import Link from "next/link";
import { authFetch } from "@/lib/api-client";
import VenueWallCard from "@/components/VenueWallCard";
import Breadcrumbs from "@/components/Breadcrumbs";
import VenueProfileApplyCta from "@/components/VenueProfileApplyCta";

interface VenueShape {
  slug: string;
  name?: string;
  type: string | null;
  location?: string | null;
  city?: string | null;
  wall_space?: string | null;
  description?: string | null;
  image?: string | null;
  images?: string[] | null;
  approximate_footfall?: string | null;
  audience_type?: string | null;
  interested_in_free_loan?: boolean | null;
  interested_in_revenue_share?: boolean | null;
  interested_in_direct_purchase?: boolean | null;
  preferred_styles?: string[] | null;
  preferred_themes?: string[] | null;
  display_wall_space?: string | null;
  display_lighting?: string | null;
  display_install_notes?: string | null;
  display_rotation_frequency?: string | null;
}

interface PublicWall {
  id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  kind: "preset" | "uploaded";
  wall_color_hex: string;
  source_image_url?: string;
  preview_image_url?: string;
}

interface PublicArtworkRequest {
  id: string;
  title: string;
  description: string | null;
  intent: string[] | null;
  budget_min_pence: number | null;
  budget_max_pence: number | null;
  created_at: string;
}

interface ProfileResponse {
  locked: boolean;
  venue: VenueShape;
  walls: PublicWall[];
  openRequests: PublicArtworkRequest[];
}

type State =
  | { status: "loading" }
  | { status: "notfound" }
  | { status: "ready"; data: ProfileResponse };

export default function VenueProfileBody({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/venues/${encodeURIComponent(slug)}/profile`, {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setState({ status: "notfound" });
          return;
        }
        const data = (await res.json()) as ProfileResponse;
        if (!cancelled) setState({ status: "ready", data });
      } catch {
        if (!cancelled) setState({ status: "notfound" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Give entitled viewers a proper tab title without leaking the name in the
  // server-rendered <title> (metadata can't be per-viewer).
  useEffect(() => {
    if (state.status === "ready" && !state.data.locked && state.data.venue.name) {
      document.title = `${state.data.venue.name} · Wallplace`;
    }
  }, [state]);

  if (state.status === "loading") {
    return (
      <div className="bg-background min-h-screen">
        <div className="h-[280px] sm:h-[360px] bg-border/20 animate-pulse" />
        <div className="max-w-[1100px] mx-auto px-6 py-10 space-y-4">
          <div className="h-6 w-1/3 bg-border/30 rounded-sm animate-pulse" />
          <div className="h-4 w-2/3 bg-border/20 rounded-sm animate-pulse" />
        </div>
      </div>
    );
  }

  if (state.status === "notfound") {
    return (
      <div className="bg-background min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <p className="font-serif text-2xl mb-2">Space not found</p>
          <Link href="/spaces" className="text-sm text-accent hover:underline">
            &larr; Back to all spaces
          </Link>
        </div>
      </div>
    );
  }

  const { locked, venue, walls, openRequests } = state.data;
  const typeCity = [venue.type, venue.city || venue.location].filter(Boolean).join(" in ");

  if (locked) {
    return (
      <div className="bg-background min-h-screen">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-5">
          <Breadcrumbs items={[{ label: "Spaces", href: "/spaces" }, { label: typeCity || "Space" }]} />
        </div>
        <div className="relative h-[280px] sm:h-[360px] bg-foreground/10 overflow-hidden">
          <div className="absolute inset-0 backdrop-blur-xl bg-foreground/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center max-w-md px-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/60 mb-2">
                {typeCity || "Venue space"}
              </p>
              <h1 className="font-serif text-2xl sm:text-3xl text-foreground mb-3">
                This venue is for subscribers
              </h1>
              <p className="text-sm text-muted mb-5">
                Subscribe to see this venue&rsquo;s name, photos, what they&rsquo;re
                looking for, and to message them directly.
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center px-5 py-2.5 bg-foreground text-white text-sm rounded-sm hover:bg-foreground/90 transition-colors"
              >
                See plans
              </Link>
              <div className="mt-3">
                <Link href="/spaces" className="text-xs text-accent hover:underline">
                  &larr; Back to all spaces
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const gallery = (venue.images || []).filter(Boolean);
  const hero = gallery[0] || venue.image || null;
  const arrangements = [
    venue.interested_in_free_loan && ARRANGEMENT_LABEL.paid_loan,
    venue.interested_in_revenue_share && ARRANGEMENT_LABEL.revenue_share,
    venue.interested_in_direct_purchase && ARRANGEMENT_LABEL.purchase,
  ].filter(Boolean) as string[];

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-5">
        <Breadcrumbs items={[{ label: "Spaces", href: "/spaces" }, { label: venue.name || "Space" }]} />
      </div>
      {/* Hero */}
      <div className="relative h-[280px] sm:h-[360px] bg-border/20">
        {hero && (
          <Image
            src={hero}
            alt={venue.name || "Venue"}
            fill
            className="object-cover"
            sizes="100vw"
            quality={92}
            priority
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 text-white">
          <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] opacity-80">
                {[venue.type, venue.city || venue.location].filter(Boolean).join(" · ")}
              </p>
              <h1 className="font-serif text-3xl sm:text-4xl mt-1">{venue.name}</h1>
            </div>
            <VenueProfileApplyCta
              venueSlug={venue.slug}
              venueName={venue.name || ""}
              hasOpenRequests={false} // artwork requests parked 2026-08-28
            />
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10">
        {/* Main */}
        <div className="space-y-10">
          {venue.description && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">About the space</h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{venue.description}</p>
            </section>
          )}

          {/* Open artwork requests parked (owner decision 2026-08-28);
              the data still loads so the parking is a render change only. */}

          {walls.length > 0 && (
            <section id="walls" className="scroll-mt-24">
              <h2 className="font-serif text-lg text-foreground mb-1">Available walls</h2>
              <p className="text-xs text-muted mb-3">
                Walls this venue has measured up. Tap a card to view it
                in detail and request a placement on that exact wall.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {walls.map((w) => (
                  <VenueWallCard key={w.id} wall={w} venue={{ slug: venue.slug, name: venue.name || "", acceptsArtistOutreach: (venue as { acceptsArtistOutreach?: boolean }).acceptsArtistOutreach }} />
                ))}
              </div>
            </section>
          )}

          {gallery.length > 1 && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {gallery.slice(1).map((url, i) => (
                  <div key={i} className="relative aspect-[4/3] rounded-sm overflow-hidden border border-border bg-background">
                    <Image src={url} alt="" fill className="object-cover" sizes="(max-width: 640px) 50vw, 33vw" quality={88} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {(venue.display_wall_space || venue.display_lighting || venue.display_install_notes || venue.display_rotation_frequency) && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">Display needs</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {venue.display_wall_space && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted">Wall space</dt>
                    <dd className="text-foreground">{venue.display_wall_space}</dd>
                  </div>
                )}
                {venue.display_lighting && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted">Lighting</dt>
                    <dd className="text-foreground">{venue.display_lighting}</dd>
                  </div>
                )}
                {venue.display_install_notes && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted">Installation notes</dt>
                    <dd className="text-foreground">{venue.display_install_notes}</dd>
                  </div>
                )}
                {venue.display_rotation_frequency && (
                  <div>
                    <dt className="text-[10px] uppercase tracking-wider text-muted">Rotation</dt>
                    <dd className="text-foreground">{venue.display_rotation_frequency}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {((venue.preferred_styles || []).length > 0 || (venue.preferred_themes || []).length > 0) && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">What the venue looks for</h2>
              {(venue.preferred_styles || []).length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Styles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(venue.preferred_styles || []).map((s) => (
                      <span key={s} className="text-xs px-2 py-1 bg-surface text-foreground border border-border rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {(venue.preferred_themes || []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Themes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(venue.preferred_themes || []).map((t) => (
                      <span key={t} className="text-xs px-2 py-1 bg-surface text-foreground border border-border rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Sidebar facts */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
            {arrangements.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Arrangements</p>
                <div className="flex flex-wrap gap-1.5">
                  {arrangements.map((a) => (
                    <span key={a} className="text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-sm">{a}</span>
                  ))}
                </div>
              </div>
            )}
            {venue.wall_space && <Fact label="Wall space" value={venue.wall_space} />}
            {venue.approximate_footfall && <Fact label="Footfall" value={venue.approximate_footfall} />}
            {venue.audience_type && <Fact label="Audience" value={venue.audience_type} />}
            {(venue.city || venue.location) && (
              <Fact label="Location" value={(venue.city || venue.location) as string} />
            )}
          </div>
          <Link href="/spaces" className="inline-flex items-center gap-1 mt-4 text-xs text-accent hover:underline">
            &larr; All spaces
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
