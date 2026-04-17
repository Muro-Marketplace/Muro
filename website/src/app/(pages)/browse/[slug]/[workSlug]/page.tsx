import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { artists } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { getArtistBySlug } from "@/lib/db/merged-data";
import ArtworkPageClient from "./ArtworkPageClient";
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

  const description = `${work.title} — ${work.medium}, ${work.dimensions}. ${work.available ? "Available" : "Sold"}. By ${artist.name} on Wallplace.`;

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

  // Other works by this artist (excluding current)
  const otherWorks = artist.works.filter((w) => w.id !== work.id);

  return (
    <div className="bg-background">
      {/* Breadcrumb */}
      <section className="pt-6 pb-2">
        <div className="max-w-[1200px] mx-auto px-6">
          <nav className="flex items-center gap-1.5 text-xs text-muted">
            <Link
              href="/browse"
              className="hover:text-foreground transition-colors"
            >
              Browse
            </Link>
            <span>/</span>
            <Link
              href={`/browse/${slug}`}
              className="hover:text-foreground transition-colors"
            >
              {artist.name}
            </Link>
            <span>/</span>
            <span className="text-foreground">{work.title}</span>
          </nav>
        </div>
      </section>

      {/* Main content */}
      <section className="py-8 lg:py-12">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Image */}
            <div
              className="flex-1 relative bg-[#f5f5f3] rounded-sm overflow-hidden select-none"
              onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
            >
              <div
                className="relative w-full"
                style={{
                  aspectRatio:
                    work.orientation === "landscape"
                      ? "4/3"
                      : work.orientation === "square"
                        ? "1/1"
                        : "3/4",
                }}
              >
                <Image
                  src={work.image}
                  alt={`${work.title} — ${work.medium}`}
                  fill
                  className="object-contain p-4 pointer-events-none select-none"
                  sizes="(max-width: 1024px) 100vw, 700px"
                  quality={75}
                  priority
                  draggable={false}
                  onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
                />
                {/* Transparent overlay to block save-as */}
                <div className="absolute inset-0" />
              </div>
            </div>

            {/* Details panel */}
            <div className="lg:w-[360px] shrink-0">
              <ArtworkPageClient
                work={work}
                artistName={artist.name}
                artistSlug={artist.slug}
                shipsInternationally={artist.shipsInternationally}
                internationalShippingPrice={artist.internationalShippingPrice}
              />
            </div>
          </div>
        </div>
      </section>

      {/* View full portfolio link */}
      <section className="pb-8">
        <div className="max-w-[1200px] mx-auto px-6">
          <Link
            href={`/browse/${slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 11L5 7l4-4" />
            </svg>
            View full portfolio by {artist.name}
          </Link>
        </div>
      </section>

      {/* More works by this artist */}
      {otherWorks.length > 0 && (
        <section className="py-10 lg:py-14 border-t border-border">
          <div className="max-w-[1200px] mx-auto px-6">
            <h2 className="text-xl mb-6">
              More by {artist.name}
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
              {otherWorks.slice(0, 8).map((otherWork) => (
                <Link
                  key={otherWork.id}
                  href={`/browse/${slug}/${slugify(otherWork.title)}`}
                  className="group shrink-0 w-48 lg:w-56"
                >
                  <div className="relative aspect-square rounded-sm overflow-hidden bg-border/20 mb-2">
                    <Image
                      src={otherWork.image}
                      alt={otherWork.title}
                      fill
                      className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      sizes="224px"
                      quality={50}
                    />
                    <div className="absolute top-2 right-2">
                      {otherWork.available ? (
                        <span className="inline-block px-2 py-0.5 bg-accent/90 text-white text-[9px] rounded-sm backdrop-blur-sm">
                          Available
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 bg-black/60 text-white text-[9px] rounded-sm backdrop-blur-sm">
                          Sold
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-accent transition-colors">
                    {otherWork.title}
                  </p>
                  <p className="text-xs text-muted">
                    {otherWork.priceBand}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
