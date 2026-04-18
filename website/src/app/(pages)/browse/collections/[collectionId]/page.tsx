"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { ArtistCollection } from "@/data/collections";
import type { ArtistWork } from "@/data/artists";
import { useCart } from "@/context/CartContext";
import SaveButton from "@/components/SaveButton";

type CollectionWork = ArtistWork & {
  selectedSize?: string;
  selectedSizePrice?: number;
};

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const collectionId = params.collectionId as string;
  const [collection, setCollection] = useState<ArtistCollection | null>(null);
  const [works, setWorks] = useState<CollectionWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    fetch(`/api/collections/${encodeURIComponent(collectionId)}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const data = await r.json();
        if (cancelled) return;
        if (data.collection) {
          setCollection(data.collection);
          setWorks((data.works || []) as CollectionWork[]);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-muted text-sm">Loading collection...</p>
      </div>
    );
  }

  if (notFound || !collection) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-2xl font-serif mb-3">Collection not found</h1>
          <Link href="/browse" className="text-sm text-accent hover:text-accent-hover">
            Back to marketplace
          </Link>
        </div>
      </div>
    );
  }

  const individualTotal = works.reduce(
    (sum, w) => sum + (w.selectedSizePrice || 0),
    0
  );
  const savings =
    individualTotal > 0 && collection.bundlePrice > 0
      ? Math.max(0, individualTotal - collection.bundlePrice)
      : 0;

  function handleBuyCollection() {
    if (!collection) return;
    addItem({
      type: "collection",
      collectionId: collection.id,
      artistSlug: collection.artistSlug,
      artistName: collection.artistName,
      title: collection.name + " (Collection)",
      image: collection.coverImage,
      size: `${collection.workIds.length} works`,
      price: collection.bundlePrice,
      quantity: 1,
    });
    router.push("/checkout");
  }

  return (
    <div>
      {/* Banner */}
      <section className="relative h-64 lg:h-80 overflow-hidden">
        <Image
          src={collection.bannerImage || collection.thumbnail || collection.coverImage}
          alt={collection.name}
          fill
          className="object-cover"
          priority
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative h-full flex items-end">
          <div className="max-w-[1200px] mx-auto px-6 pb-8 w-full">
            <Link
              href={`/browse/${collection.artistSlug}`}
              className="text-white/60 text-xs hover:text-white transition-colors mb-2 inline-block"
            >
              &larr; {collection.artistName}
            </Link>
            <h1 className="text-3xl lg:text-4xl font-serif text-white mb-2">{collection.name}</h1>
            <p className="text-white/60 text-sm">
              {collection.workIds.length} works &middot; {collection.bundlePriceBand}
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-3 gap-10">
          {/* Works grid */}
          <div className="lg:col-span-2">
            {collection.description && (
              <p className="text-muted leading-relaxed mb-8">{collection.description}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {works.map((work) => (
                <div
                  key={work.id}
                  className="group relative rounded-sm overflow-hidden bg-border/20"
                >
                  <div className="relative select-none" onContextMenu={(e) => e.preventDefault()}>
                    <Image
                      src={work.image}
                      alt={work.title}
                      width={600}
                      height={400}
                      className="w-full h-auto object-cover pointer-events-none"
                      sizes="(max-width: 640px) 100vw, 50vw"
                      draggable={false}
                      unoptimized
                    />
                    <div className="absolute inset-0" />
                    <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <SaveButton type="work" itemId={work.id} />
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium">{work.title}</h3>
                    <p className="text-xs text-muted">
                      {work.medium}
                      {work.dimensions ? ` · ${work.dimensions}` : ""}
                    </p>
                    {work.selectedSize && (
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-muted uppercase tracking-wider">
                          Size
                        </span>
                        <span className="text-xs font-medium">
                          {work.selectedSize}
                          {work.selectedSizePrice != null
                            ? ` · £${work.selectedSizePrice}`
                            : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {works.length === 0 && (
                <p className="text-sm text-muted col-span-2">
                  This collection has no works to display yet.
                </p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            <div className="bg-surface border border-border rounded-sm p-6 lg:sticky lg:top-24">
              <p className="text-xs text-muted uppercase tracking-wider mb-1">
                {collection.artistName}
              </p>
              <h2 className="text-lg font-serif mb-2">{collection.name}</h2>
              <p className="text-2xl font-serif text-accent mb-1">
                {collection.bundlePriceBand}
              </p>
              {savings > 0 && (
                <p className="text-xs text-green-700 mb-3">
                  Save £{savings} vs. buying individually (£{individualTotal})
                </p>
              )}
              <p className="text-xs text-muted mb-6">
                All {collection.workIds.length} works at the sizes selected by the artist, one price.
              </p>

              {works.length > 0 && (
                <div className="mb-6 space-y-1.5">
                  {works.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between text-[11px] text-muted"
                    >
                      <span className="truncate pr-2">{w.title}</span>
                      <span className="shrink-0">
                        {w.selectedSize || "—"}
                        {w.selectedSizePrice != null ? ` · £${w.selectedSizePrice}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {collection.available && (
                  <button
                    onClick={handleBuyCollection}
                    className="w-full px-5 py-3 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
                  >
                    Buy Collection – {collection.bundlePriceBand}
                  </button>
                )}
                <div className="flex gap-2">
                  <Link
                    href={`/browse/${collection.artistSlug}`}
                    className="flex-1 inline-flex items-center justify-center px-5 py-3 text-sm font-medium text-foreground border border-border hover:border-foreground/30 rounded-sm transition-colors"
                  >
                    View Artist
                  </Link>
                  <SaveButton type="collection" itemId={collection.id} size="md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
