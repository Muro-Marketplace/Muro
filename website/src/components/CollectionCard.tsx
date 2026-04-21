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
        <Image
          src={collection.thumbnail || collection.bannerImage || collection.coverImage}
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
        <div className="absolute bottom-3 left-3">
          <span className="text-[10px] font-medium px-2 py-0.5 bg-white/90 text-foreground rounded-sm backdrop-blur-sm">
            {collection.workIds.length} works
          </span>
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
        <p className="text-sm font-medium text-accent">{collection.bundlePriceBand}</p>
      </div>
    </Link>
  );
}
