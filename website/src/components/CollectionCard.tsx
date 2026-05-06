"use client";

// onContextMenu={(e) => e.preventDefault()} on the wrapping <div> and
// the <Image> are event-handler props, and Next.js 16 / React Server
// Components forbid passing those from a server component down to a
// child. This card is rendered server-side from <CollectionsSection>
// inside /browse/[slug]/page.tsx, without "use client" the whole
// profile route 500s with "Event handlers cannot be passed to Client
// Component props" the moment the artist has at least one renderable
// collection. (The digest seen in prod was 1299673914.)
import Link from "next/link";
import Image from "next/image";
import type { ArtistCollection } from "@/data/collections";
import SaveButton from "./SaveButton";

interface CollectionCardProps {
  collection: ArtistCollection;
  distance?: number | null;
}

export default function CollectionCard({ collection, distance }: CollectionCardProps) {
  return (
    <Link
      href={`/browse/collections/${collection.id}`}
      className="group block bg-surface border border-border rounded-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
    >
      <div
        className="relative aspect-[16/9] bg-border/20 select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Picsum fallback so a collection without any image source
            still renders rather than crashing the page. Next.js
            Image throws on src="", and the artist_collections
            schema doesn't guarantee any of thumbnail / bannerImage /
            coverImage are populated. */}
        <Image
          src={
            collection.thumbnail ||
            collection.bannerImage ||
            collection.coverImage ||
            `https://picsum.photos/seed/${collection.id}/800/450`
          }
          alt={collection.name}
          fill
          className="object-cover group-hover:scale-[1.02] transition-transform duration-500 pointer-events-none select-none"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          unoptimized
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute top-3 right-3">
          <SaveButton type="collection" itemId={collection.id} />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs text-muted mb-0.5 min-w-0 truncate">{collection.artistName}</p>
          {distance != null && (
            <span className="text-[10px] text-muted shrink-0">
              {distance < 0.2 ? "< 0.2 mi" : `${distance.toFixed(1)} mi`}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium text-foreground mb-1">{collection.name}</h3>
        {collection.description && (
          <p className="text-xs text-muted line-clamp-2 mb-2">{collection.description}</p>
        )}
        {/* Plan F #11: collapse the count + price band into one
            metadata line so both are visible at a glance. The count
            previously sat as an image-overlay pill, which faded
            against bright collection thumbnails. */}
        <p className="text-xs text-muted">
          <span>
            {collection.workIds.length} work
            {collection.workIds.length === 1 ? "" : "s"}
          </span>
          {collection.bundlePriceBand && (
            <>
              {" · "}
              <span className="text-accent font-medium">
                {collection.bundlePriceBand}
              </span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
