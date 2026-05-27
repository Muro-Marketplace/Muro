"use client";

// Client-rendered venue detail. The /venues/[slug] page is a thin
// Server Component that just renders this; all DB reads happen
// through /api/venues/[slug], which gates on the spaces paywall
// (canViewSpaceDetails) and returns 403 when the viewer isn't
// allowed. So we never SSR protected fields; the page source is
// neutral until the client confirms access.
//
// Three render states:
//   - "loading"   while the API call is in flight
//   - "gated"     the API returned 403 (or 401 with no auth) — show
//                 the upgrade screen
//   - "ready"     the API returned 200 — show the full venue page
//
// 404 is special-cased: the API returns a 404 + { error: "Venue not
// found" } and we render the existing notFound() equivalent inline.

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import Breadcrumbs from "@/components/Breadcrumbs";
import VenueWallCard from "@/components/VenueWallCard";
import VenueProfileApplyCta from "@/components/VenueProfileApplyCta";

interface VenueShape {
  slug: string;
  name: string;
  type: string | null;
  location?: string | null;
  city?: string | null;
  postcode?: string | null;
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

interface VenueResponse {
  venue: VenueShape;
  source: "database" | "static";
  publicWalls: PublicWall[];
  openRequests: PublicArtworkRequest[];
  viewerIsOwner: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "gated" }
  | { kind: "not_found" }
  | { kind: "ready"; data: VenueResponse };

export default function VenueDetailClient({ slug }: { slug: string }) {
  const { session, loading: authLoading } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });
  const accessToken = session?.access_token ?? null;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const res = await fetch(`/api/venues/${encodeURIComponent(slug)}`, {
          headers,
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.status === 403) {
          setState({ kind: "gated" });
          return;
        }
        if (res.status === 404) {
          setState({ kind: "not_found" });
          return;
        }
        if (!res.ok) {
          setState({ kind: "gated" });
          return;
        }
        const data = (await res.json()) as VenueResponse;
        if (!cancelled) setState({ kind: "ready", data });
      } catch {
        if (!cancelled) setState({ kind: "gated" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, accessToken, authLoading]);

  if (state.kind === "loading" || authLoading) {
    return <LoadingShell />;
  }
  if (state.kind === "not_found") {
    return <NotFoundShell slug={slug} />;
  }
  if (state.kind === "gated") {
    return <UpgradeShell />;
  }
  return <FullVenue data={state.data} />;
}

function LoadingShell() {
  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-5">
        <Breadcrumbs items={[{ label: "Spaces", href: "/spaces" }, { label: "Loading" }]} />
      </div>
      <div className="h-[280px] sm:h-[360px] bg-border/20" />
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
        <div className="h-6 w-1/3 bg-border/40 rounded-sm mb-4" />
        <div className="h-4 w-full bg-border/30 rounded-sm mb-2" />
        <div className="h-4 w-2/3 bg-border/30 rounded-sm" />
      </div>
    </div>
  );
}

function NotFoundShell({ slug }: { slug: string }) {
  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-[700px] mx-auto px-6 py-24 text-center">
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-4">
          Not found
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl text-foreground mb-3">
          We couldn&rsquo;t find that space
        </h1>
        <p className="text-sm text-muted mb-6">
          The link to <span className="font-mono text-foreground/70">/{slug}</span> doesn&rsquo;t
          match any venue on Wallplace. It may have been removed or the slug may
          be wrong.
        </p>
        <Link
          href="/spaces"
          className="inline-flex items-center justify-center px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
        >
          Browse all spaces
        </Link>
      </div>
    </div>
  );
}

function UpgradeShell() {
  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-[700px] mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 text-accent mb-5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <p className="text-xs font-medium tracking-[0.2em] uppercase text-accent mb-3">
          Subscribers only
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl text-foreground mb-3">
          Subscribe to view this space
        </h1>
        <p className="text-sm text-muted mb-6 max-w-md mx-auto">
          Venue names, descriptions, photos and contact details are reserved
          for Wallplace artists. Plans from £9.99 a month, cancel any time.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
          >
            View plans
          </Link>
          <Link
            href="/spaces"
            className="inline-flex items-center justify-center px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Back to spaces
          </Link>
        </div>
      </div>
    </div>
  );
}

function FullVenue({ data }: { data: VenueResponse }) {
  const { venue, publicWalls, openRequests } = data;
  const gallery = (venue.images || []).filter(Boolean);
  const hero = gallery[0] || venue.image || null;
  const arrangements = [
    venue.interested_in_free_loan && "Paid loan",
    venue.interested_in_revenue_share && "Revenue share",
    venue.interested_in_direct_purchase && "Direct purchase",
  ].filter(Boolean) as string[];

  return (
    <div className="bg-background min-h-screen">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-5">
        <Breadcrumbs
          items={[
            { label: "Spaces", href: "/spaces" },
            { label: venue.name || "Space" },
          ]}
        />
      </div>
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
              venueName={venue.name}
              hasOpenRequests={openRequests.length > 0}
            />
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10">
        <div className="space-y-10">
          {venue.description && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">About the space</h2>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {venue.description}
              </p>
            </section>
          )}

          {openRequests.length > 0 && (
            <section id="open-requests" className="scroll-mt-24">
              <h2 className="font-serif text-lg text-foreground mb-1">Open artwork requests</h2>
              <p className="text-xs text-muted mb-3">
                What this venue is calling for right now. Submit work that fits
                the brief and they&rsquo;ll see it in their inbox.
              </p>
              <ul className="space-y-2">
                {openRequests.map((r) => {
                  const rawMin = r.budget_min_pence ?? null;
                  const rawMax = r.budget_max_pence ?? null;
                  const min = rawMin != null && rawMax != null && rawMin > rawMax ? rawMax : rawMin;
                  const max = rawMin != null && rawMax != null && rawMin > rawMax ? rawMin : rawMax;
                  const budget =
                    min != null && max != null
                      ? `£${(min / 100).toFixed(0)} to £${(max / 100).toFixed(0)}`
                      : min != null
                      ? `from £${(min / 100).toFixed(0)}`
                      : max != null
                      ? `up to £${(max / 100).toFixed(0)}`
                      : null;
                  return (
                    <li
                      key={r.id}
                      className="border border-border rounded-sm p-4 hover:border-accent/40 transition-colors"
                    >
                      <Link href={`/artist-portal/artwork-requests/${r.id}`} className="block">
                        <p className="text-sm font-medium text-foreground mb-1">{r.title}</p>
                        {r.description && (
                          <p className="text-xs text-muted line-clamp-2">{r.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2 text-[10px]">
                          {(r.intent || []).map((i) => (
                            <span
                              key={i}
                              className="px-1.5 py-0.5 bg-accent/5 text-accent rounded-sm capitalize"
                            >
                              {i}
                            </span>
                          ))}
                          {budget && (
                            <span className="px-1.5 py-0.5 bg-foreground/5 text-foreground/70 rounded-sm">
                              {budget}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {publicWalls.length > 0 && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-1">Available walls</h2>
              <p className="text-xs text-muted mb-3">
                Walls this venue has measured up. Tap a card to view it in
                detail and request a placement on that exact wall.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {publicWalls.map((w) => (
                  <VenueWallCard
                    key={w.id}
                    wall={w}
                    venue={{ slug: venue.slug, name: venue.name }}
                  />
                ))}
              </div>
            </section>
          )}

          {gallery.length > 1 && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">Gallery</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {gallery.slice(1).map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-[4/3] rounded-sm overflow-hidden border border-border bg-background"
                  >
                    <Image
                      src={url}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 33vw"
                      quality={88}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {(venue.display_wall_space ||
            venue.display_lighting ||
            venue.display_install_notes ||
            venue.display_rotation_frequency) && (
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
                    <dt className="text-[10px] uppercase tracking-wider text-muted">
                      Installation notes
                    </dt>
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

          {((venue.preferred_styles || []).length > 0 ||
            (venue.preferred_themes || []).length > 0) && (
            <section>
              <h2 className="font-serif text-lg text-foreground mb-3">
                What the venue looks for
              </h2>
              {(venue.preferred_styles || []).length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Styles</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(venue.preferred_styles || []).map((s) => (
                      <span
                        key={s}
                        className="text-xs px-2 py-1 bg-surface text-foreground border border-border rounded-full"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(venue.preferred_themes || []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Themes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(venue.preferred_themes || []).map((t) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-1 bg-surface text-foreground border border-border rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-surface border border-border rounded-sm p-5 space-y-4">
            {arrangements.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                  Arrangements
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {arrangements.map((a) => (
                    <span
                      key={a}
                      className="text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-sm"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {venue.wall_space && <Fact label="Wall space" value={venue.wall_space} />}
            {venue.approximate_footfall && (
              <Fact label="Footfall" value={venue.approximate_footfall} />
            )}
            {venue.audience_type && <Fact label="Audience" value={venue.audience_type} />}
            {(venue.city || venue.location) && (
              <Fact label="Location" value={(venue.city || venue.location) as string} />
            )}
          </div>
          <Link
            href="/spaces"
            className="inline-flex items-center gap-1 mt-4 text-xs text-accent hover:underline"
          >
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
