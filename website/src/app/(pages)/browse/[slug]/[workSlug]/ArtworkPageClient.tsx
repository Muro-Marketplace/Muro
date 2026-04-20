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

  return (
    <div className="flex flex-col justify-between h-full">
      {/* Artist */}
      <div>
        <p className="text-xs text-muted uppercase tracking-wider mb-1">
          {artistName}
        </p>

        {/* Title */}
        <h1 className="text-2xl lg:text-3xl font-serif text-foreground leading-snug mb-4">
          {work.title}
        </h1>

        {/* Details */}
        <div className="space-y-2 mb-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Medium</span>
            <span className="text-foreground font-medium">{work.medium}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Dimensions</span>
            <span className="text-foreground font-medium">
              {work.dimensions}
            </span>
          </div>
        </div>

        {/* Availability + Save */}
        <div className="flex items-center justify-between mb-5">
          {work.available ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-accent">
              <span className="w-2 h-2 rounded-full bg-accent" />
              {typeof work.quantityAvailable === "number"
                ? work.quantityAvailable > 0
                  ? `${work.quantityAvailable} left`
                  : "Sold out"
                : "Available"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <span className="w-2 h-2 rounded-full bg-muted" />
              Sold
            </span>
          )}
          <SaveButton type="work" itemId={work.id} size="sm" />
        </div>

        {/* Size & Price dropdown */}
        {work.available && work.pricing.length > 0 && (
          <div className="mb-5">
            <p className="text-xs text-muted uppercase tracking-wider mb-2">
              Size & Price
            </p>
            <select
              value={selectedSizeIdx}
              onChange={(e) => setSelectedSizeIdx(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
            >
              {work.pricing.map((sp, i) => (
                <option key={sp.label} value={i}>
                  {sp.label} — £{sp.price}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Shipping info */}
        <div className="text-xs text-muted mt-1 space-y-0.5">
          <p>
            {work.shippingPrice === 0
              ? "UK: Free shipping"
              : work.shippingPrice
                ? `UK shipping: £${work.shippingPrice.toFixed(2)}`
                : "UK shipping: £9.95"}
          </p>
          {shipsInternationally && internationalShippingPrice != null ? (
            <p>International: £{internationalShippingPrice.toFixed(2)}</p>
          ) : (
            <p>UK shipping only</p>
          )}
        </div>
      </div>

      {/* CTAs */}
      <div className="space-y-2 mt-6">
        {user && userType === "venue" && (
          <button
            onClick={() => {
              router.push(
                `/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}&work=${encodeURIComponent(work.title)}&workImage=${encodeURIComponent(work.image)}`
              );
            }}
            className="w-full px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            Request Placement
          </button>
        )}
        {work.available && work.pricing.length > 0 && (
          <>
            <button
              onClick={() => {
                const selected =
                  work.pricing[selectedSizeIdx] || work.pricing[0];
                addItem({
                  type: "work",
                  workId: work.id,
                  artistSlug,
                  artistName,
                  title: work.title,
                  image: work.image,
                  size: selected.label,
                  price: selected.price,
                  quantity: 1,
                  shippingPrice: work.shippingPrice ?? undefined,
                  internationalShippingPrice: shipsInternationally && internationalShippingPrice != null ? internationalShippingPrice : undefined,
                });
                router.push("/checkout");
              }}
              className="w-full px-5 py-3 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors"
            >
              Buy Now – £
              {(work.pricing[selectedSizeIdx] || work.pricing[0]).price}
            </button>
            <button
              onClick={() => {
                const selected =
                  work.pricing[selectedSizeIdx] || work.pricing[0];
                addItem({
                  type: "work",
                  workId: work.id,
                  artistSlug,
                  artistName,
                  title: work.title,
                  image: work.image,
                  size: selected.label,
                  price: selected.price,
                  quantity: 1,
                  shippingPrice: work.shippingPrice ?? undefined,
                  internationalShippingPrice: shipsInternationally && internationalShippingPrice != null ? internationalShippingPrice : undefined,
                });
                showToast("Added to basket");
              }}
              className="w-full px-5 py-2.5 text-sm font-medium text-foreground border border-border hover:border-foreground/30 rounded-sm transition-colors"
            >
              Add to Basket
            </button>
          </>
        )}
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
            className="w-full px-5 py-2.5 text-sm font-medium text-foreground border border-accent text-accent hover:bg-accent/5 rounded-sm transition-colors"
          >
            Buy Original (In Store) – £{work.inStorePrice}
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
          className="w-full px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
        >
          Message Artist
        </button>
      </div>
    </div>
  );
}
