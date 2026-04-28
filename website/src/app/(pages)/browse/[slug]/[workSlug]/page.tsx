import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { artists } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { getArtistBySlug } from "@/lib/db/merged-data";
import ArtworkPageClient from "./ArtworkPageClient";
import ArtworkImageViewer from "@/components/ArtworkImageViewer";
import type { Metadata } from "next";

// Static params for seed artists — database artists use dynamic fallback
export async function generateStaticParams() {
  return artists.flatMap((artist) =>
    artist.works.map((work) => ({
      slug: artist.slug,
      workSlug: slugify(work.title),
    }))
  );
}

export const dynamicParams = true;
// Always read fresh from DB so newly-saved description/images show immediately
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; workSlug: string }>;
}): Promise<Metadata> {
  const { slug, workSlug } = await params;
  let artist;
  try {
    artist = await getArtistBySlug(slug);
  } catch {
    return { title: "Artwork – Wallplace" };
  }

  if (!artist) {
    return { title: "Artwork Not Found – Wallplace" };
  }

  const work = artist.works.find((w) => slugify(w.title) === workSlug);

  if (!work) {
    return { title: "Artwork Not Found – Wallplace" };
  }

  const description = work.description && work.description.trim()
    ? work.description.slice(0, 160)
    : `${work.title} — ${work.medium}, ${work.dimensions}. ${work.available ? "Available" : "Sold"}. By ${artist.name} on Wallplace.`;

  return {
    title: `${work.title} by ${artist.name} – Wallplace`,
    description,
    openGraph: {
      title: `${work.title} by ${artist.name} – Wallplace`,
      description,
      images: work.image ? [{ url: work.image, width: 800, height: 800 }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${work.title} by ${artist.name} – Wallplace`,
      description,
      images: work.image ? [work.image] : [],
    },
  };
}

export default async function ArtworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; workSlug: string }>;
  searchParams: Promise<{ ref?: string; venue?: string }>;
}) {
  const { slug, workSlug } = await params;
  const query = await searchParams;

  let artist;
  try {
    artist = await getArtistBySlug(slug);
  } catch {
    notFound();
  }

  if (!artist) {
    notFound();
  }

  const work = artist.works.find((w) => slugify(w.title) === workSlug);

  if (!work) {
    notFound();
  }

  // Track artwork view (fire-and-forget, dynamic import to avoid crash if env vars missing)
  try {
    const [{ trackEvent, extractTrackingContext, generateVisitorId }, { headers: getHeaders }] = await Promise.all([
      import("@/lib/analytics"),
      import("next/headers"),
    ]);
    const headersList = await getHeaders();
    const ctx = extractTrackingContext(headersList);
    trackEvent({
      event_type: "artwork_view",
      artist_slug: slug,
      work_id: work.id,
      venue_name: query.venue || undefined,
      visitor_id: generateVisitorId(ctx.ip, ctx.userAgent),
      referrer: ctx.referrer || undefined,
      source: query.ref === "qr" ? "qr" : "browse",
    }).catch(() => {});
  } catch { /* ignore analytics errors */ }

  // Real "views this week" count — drives the social-proof chip on
  // ArtworkPageClient. Counts every `artwork_view` row for this work
  // in the last 7 days; we deliberately don't dedupe by visitor_id so
  // refreshes still register (matches what most marketplaces show).
  // Fire-and-forget on errors — the chip just hides if the count
  // can't be loaded.
  let viewsThisWeek = 0;
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-admin");
    const db = getSupabaseAdmin();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await db
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "artwork_view")
      .eq("work_id", work.id)
      .gte("created_at", sevenDaysAgo);
    viewsThisWeek = count || 0;
  } catch { /* ignore — chip hides */ }

  const otherWorks = artist.works.filter((w) => w.id !== work.id);
  const hasDescription = !!(work.description && work.description.trim());
  const aspectRatio =
    work.orientation === "landscape" ? "4/3" : work.orientation === "square" ? "1/1" : "3/4";

  return (
    <div className="bg-background">
      {/* Breadcrumb */}
      <section className="pt-5 pb-1">
        <div className="max-w-[1240px] mx-auto px-6">
          <nav className="flex items-center gap-1.5 text-[11px] text-muted uppercase tracking-wider">
            <Link href="/browse" className="hover:text-foreground transition-colors">
              Browse
            </Link>
            <span className="opacity-50">/</span>
            <Link href={`/browse/${slug}`} className="hover:text-foreground transition-colors">
              {artist.name}
            </Link>
            <span className="opacity-50">/</span>
            <span className="text-foreground normal-case tracking-normal font-serif">{work.title}</span>
          </nav>
        </div>
      </section>

      {/* Main: image gallery + details panel */}
      <section className="py-8 lg:py-14">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 lg:gap-14 items-start">
            <ArtworkImageViewer
              src={work.image}
              alt={`${work.title} — ${work.medium}`}
              aspectRatio={aspectRatio}
              images={work.images}
            />

            <div className="lg:sticky lg:top-24">
              <ArtworkPageClient
                work={work}
                artistName={artist.name}
                artistSlug={artist.slug}
                shipsInternationally={artist.shipsInternationally}
                internationalShippingPrice={artist.internationalShippingPrice}
                viewsThisWeek={viewsThisWeek}
              />
            </div>
          </div>
        </div>
      </section>

      {/* About this work now lives inside the right-hand details column
          (ArtworkPageClient) so the page doesn't show two copies of the
          same description. */}

      {/* More by this artist */}
      {otherWorks.length > 0 && (
        <section className="py-14 lg:py-20 border-t border-border/70">
          <div className="max-w-[1240px] mx-auto px-6">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-2">
                  Continue exploring
                </p>
                <h2 className="text-2xl lg:text-3xl font-serif">
                  More by {artist.name}
                </h2>
              </div>
              <Link
                href={`/browse/${slug}`}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
              >
                View full portfolio
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 lg:gap-7">
              {otherWorks.slice(0, 4).map((otherWork) => (
                <Link
                  key={otherWork.id}
                  href={`/browse/${slug}/${slugify(otherWork.title)}`}
                  className="group block"
                >
                  <div className="relative aspect-[4/5] rounded-sm overflow-hidden bg-[#f5f5f3] mb-3">
                    <Image
                      src={otherWork.image}
                      alt={otherWork.title}
                      fill
                      className="object-cover group-hover:scale-[1.03] transition-transform duration-700"
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      quality={55}
                    />
                    {!otherWork.available && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 bg-black/70 text-white text-[10px] tracking-wider uppercase rounded-sm backdrop-blur-sm">
                        Sold
                      </span>
                    )}
                  </div>
                  <p className="font-serif text-base text-foreground group-hover:text-accent transition-colors">
                    {otherWork.title}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {otherWork.medium} · {otherWork.priceBand}
                  </p>
                </Link>
              ))}
            </div>

            <Link
              href={`/browse/${slug}`}
              className="mt-8 sm:hidden inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
            >
              View full portfolio
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>
      )}

      {/* Seller information (CCR 2013 pre-contract disclosure) — below "More by" as a quiet footer */}
      <section className="py-10 border-t border-border/70 bg-surface/40">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-3">
              Seller information
            </p>
            <p className="text-xs text-muted leading-relaxed mb-2">
              This artwork is sold by{" "}
              <Link href={`/browse/${slug}`} className="text-foreground hover:text-accent transition-colors">
                {artist.name}
              </Link>
              , an independent artist listing on Wallplace. Your contract of sale is with the artist, not with Wallplace. Wallplace operates the platform, processes payments via Stripe, and facilitates customer service.
            </p>
            <p className="text-xs text-muted leading-relaxed">
              Contact the artist via their{" "}
              <Link href={`/browse/${slug}`} className="text-accent hover:underline">
                profile
              </Link>{" "}
              or email{" "}
              <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">
                hello@wallplace.co.uk
              </a>
              . For your 14-day right to cancel and other consumer rights, see our{" "}
              <Link href="/returns" className="text-accent hover:underline">
                Returns &amp; Refunds
              </Link>{" "}
              and{" "}
              <Link href="/terms" className="text-accent hover:underline">
                Platform Terms
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
