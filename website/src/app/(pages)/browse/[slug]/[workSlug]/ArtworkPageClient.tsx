"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ArtistWork } from "@/data/artists";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import SaveButton from "@/components/SaveButton";
import { useToast } from "@/context/ToastContext";

interface ArtworkPageClientProps {
  work: ArtistWork;
  artistName: string;
  artistSlug: string;
  shipsInternationally?: boolean;
  internationalShippingPrice?: number | null;
}

export default function ArtworkPageClient({
  work,
  artistName,
  artistSlug,
  shipsInternationally,
  internationalShippingPrice,
}: ArtworkPageClientProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { user, userType } = useAuth();
  const { showToast } = useToast();
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const frameOptions = work.frameOptions && work.frameOptions.length > 0 ? work.frameOptions : [];
  const [selectedFrameIdx, setSelectedFrameIdx] = useState(0);
  const selectedFrame = frameOptions[selectedFrameIdx];
  const frameUplift = selectedFrame?.priceUplift || 0;

  const selectedPricing = work.pricing[selectedSizeIdx] || work.pricing[0];
  const displayPrice = selectedPricing
    ? Math.round((selectedPricing.price + frameUplift) * 100) / 100
    : null;

  const availabilityLabel = (() => {
    if (!work.available) return "Sold";
    if (typeof work.quantityAvailable === "number") {
      return work.quantityAvailable > 0 ? `${work.quantityAvailable} available` : "Sold out";
    }
    return "Available";
  })();

  return (
    <div className="flex flex-col">
      {/* Artist */}
      <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-3">
        {artistName}
      </p>

      {/* Title */}
      <h1 className="text-3xl lg:text-[2.5rem] leading-[1.15] font-serif text-foreground mb-5">
        {work.title}
      </h1>

      {/* Availability + Save */}
      <div className="flex items-center justify-between pb-5 mb-5 border-b border-border">
        <span className={`inline-flex items-center gap-2 text-sm ${work.available ? "text-foreground" : "text-muted"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${work.available ? "bg-accent" : "bg-muted"}`} />
          {availabilityLabel}
        </span>
        <SaveButton type="work" itemId={work.id} size="sm" />
      </div>

      {/* Details */}
      <dl className="space-y-2.5 mb-6 text-[13px]">
        <div className="flex justify-between items-baseline">
          <dt className="text-muted uppercase tracking-wider text-[10px]">Medium</dt>
          <dd className="text-foreground text-right">{work.medium}</dd>
        </div>
        {work.dimensions && (
          <div className="flex justify-between items-baseline">
            <dt className="text-muted uppercase tracking-wider text-[10px]">Dimensions</dt>
            <dd className="text-foreground text-right">{work.dimensions}</dd>
          </div>
        )}
      </dl>

      {/* Size & Price */}
      {work.available && work.pricing.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-2.5">
            Size &amp; Price
          </p>
          {work.pricing.length === 1 ? (
            <div className="flex items-baseline justify-between py-3 border-y border-border">
              <span className="text-sm text-foreground">{work.pricing[0].label}</span>
              <span className="font-serif text-xl text-foreground">
                £{work.pricing[0].price}
              </span>
            </div>
          ) : (
            <select
              value={selectedSizeIdx}
              onChange={(e) => setSelectedSizeIdx(Number(e.target.value))}
              className="w-full px-3.5 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-foreground/50 cursor-pointer transition-colors"
            >
              {work.pricing.map((sp, i) => (
                <option key={sp.label} value={i}>
                  {sp.label} — £{sp.price}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Frame selector */}
      {work.available && frameOptions.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] text-muted uppercase tracking-[0.18em] mb-2.5">Frame</p>
          <select
            value={selectedFrameIdx}
            onChange={(e) => setSelectedFrameIdx(Number(e.target.value))}
            className="w-full px-3.5 py-3 bg-background border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-foreground/50 cursor-pointer transition-colors"
          >
            {frameOptions.map((f, i) => (
              <option key={f.label} value={i}>
                {f.label}{f.priceUplift > 0 ? ` — +£${f.priceUplift}` : ""}
              </option>
            ))}
          </select>
          {selectedFrame?.imageUrl && (
            <div className="mt-3 relative aspect-video rounded-sm overflow-hidden border border-border/60 bg-surface select-none" onContextMenu={(e) => e.preventDefault()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedFrame.imageUrl}
                alt={`${selectedFrame.label} preview`}
                className="w-full h-full object-cover pointer-events-none select-none"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          )}
        </div>
      )}

      {/* Shipping info */}
      <div className="text-[11px] text-muted space-y-0.5 mb-6">
        <p>
          {work.shippingPrice === 0
            ? "Free UK shipping"
            : work.shippingPrice
              ? `UK shipping £${work.shippingPrice.toFixed(2)}`
              : "UK shipping £9.95"}
        </p>
        {shipsInternationally && internationalShippingPrice != null ? (
          <p>International £{internationalShippingPrice.toFixed(2)}</p>
        ) : (
          <p>Ships to UK only</p>
        )}
      </div>

      {/* CTAs */}
      <div className="space-y-2">
        {user && userType === "venue" && (
          <button
            onClick={() => {
              router.push(
                `/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}&work=${encodeURIComponent(work.title)}&workImage=${encodeURIComponent(work.image)}`
              );
            }}
            className="w-full px-5 py-3 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            Request Placement
          </button>
        )}
        {work.available && selectedPricing && (() => {
          const frameLabel = selectedFrame ? ` + ${selectedFrame.label}` : "";
          const sizeLabel = `${selectedPricing.label}${frameLabel}`;
          const totalPrice = displayPrice ?? selectedPricing.price;
          return (
            <>
              <button
                onClick={() => {
                  addItem({
                    type: "work",
                    workId: work.id,
                    artistSlug,
                    artistName,
                    title: work.title,
                    image: work.image,
                    size: sizeLabel,
                    price: totalPrice,
                    quantity: 1,
                    shippingPrice: work.shippingPrice ?? undefined,
                    internationalShippingPrice: shipsInternationally && internationalShippingPrice != null ? internationalShippingPrice : undefined,
                  });
                  router.push("/checkout");
                }}
                className="w-full px-5 py-3.5 text-[13px] font-medium tracking-wider uppercase text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors"
              >
                Buy Now — £{totalPrice}
              </button>
              <button
                onClick={() => {
                  addItem({
                    type: "work",
                    workId: work.id,
                    artistSlug,
                    artistName,
                    title: work.title,
                    image: work.image,
                    size: sizeLabel,
                    price: totalPrice,
                    quantity: 1,
                    shippingPrice: work.shippingPrice ?? undefined,
                    internationalShippingPrice: shipsInternationally && internationalShippingPrice != null ? internationalShippingPrice : undefined,
                  });
                  showToast("Added to basket");
                }}
                className="w-full px-5 py-3 text-sm font-medium text-foreground border border-border hover:border-foreground/50 rounded-sm transition-colors"
              >
                Add to Basket
              </button>
            </>
          );
        })()}
        {work.available && work.inStorePrice != null && work.inStorePrice > 0 && (
          <button
            onClick={() => {
              addItem({
                type: "work",
                workId: work.id,
                artistSlug,
                artistName,
                title: `${work.title} (Original)`,
                image: work.image,
                size: "Original",
                price: work.inStorePrice!,
                quantity: 1,
                shippingPrice: 0,
              });
              router.push("/checkout");
            }}
            className="w-full px-5 py-3 text-sm font-medium text-accent border border-accent/60 hover:bg-accent/5 rounded-sm transition-colors"
          >
            Buy Original — £{work.inStorePrice}
          </button>
        )}
        <button
          onClick={() => {
            const nameParam = artistName ? `&artistName=${encodeURIComponent(artistName)}` : "";
            if (user && userType === "venue") {
              router.push(`/venue-portal/messages?artist=${artistSlug}${nameParam}`);
            } else if (user && userType === "artist") {
              router.push(`/artist-portal/messages?artist=${artistSlug}${nameParam}`);
            } else if (user) {
              router.push(`/customer-portal/messages?artist=${artistSlug}${nameParam}`);
            } else {
              router.push(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            }
          }}
          className="w-full px-5 py-3 text-sm font-medium text-foreground hover:text-accent transition-colors"
        >
          Message the artist
          <span className="ml-1">→</span>
        </button>
      </div>
    </div>
  );
}
