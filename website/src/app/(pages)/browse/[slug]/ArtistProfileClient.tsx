"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { ArtistWork } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import SaveButton from "@/components/SaveButton";

interface ArtistProfileClientProps {
  artistName: string;
  artistSlug: string;
  extendedBio: string;
  themes: string[];
  works: ArtistWork[];
}

export default function ArtistProfileClient({
  artistName,
  artistSlug,
  extendedBio,
  themes,
  works,
}: ArtistProfileClientProps) {
  const router = useRouter();
  const { addItem } = useCart();
  const { user, displayName: authDisplayName, userType } = useAuth();
  const [activeTheme, setActiveTheme] = useState("All");
  const [bioExpanded, setBioExpanded] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(0);
  const [showEnquiry, setShowEnquiry] = useState(false);
  const [selectedForPlacement, setSelectedForPlacement] = useState<Set<number>>(new Set());

  function togglePlacementSelection(index: number) {
    setSelectedForPlacement((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleRequestPlacement() {
    const workTitles = Array.from(selectedForPlacement).map((i) => filteredWorks[i]?.title).filter(Boolean);
    const firstWork = filteredWorks[Array.from(selectedForPlacement)[0]];
    if (userType === "venue") {
      router.push(`/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}&work=${encodeURIComponent(workTitles[0] || "")}&workImage=${encodeURIComponent(firstWork?.image || "")}`);
    } else if (userType === "artist") {
      router.push(`/artist-portal/placements`);
    }
  }
  const [enquirySent, setEnquirySent] = useState(false);

  const allThemes = ["All", ...themes];

  const filteredWorks =
    activeTheme === "All"
      ? works
      : works.filter((w) => {
          const haystack = `${w.title} ${w.medium}`.toLowerCase();
          return haystack.includes(activeTheme.toLowerCase());
        });

  // Keyboard navigation for lightbox
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight") setLightboxIndex((prev) => (prev !== null && prev < filteredWorks.length - 1 ? prev + 1 : prev));
      if (e.key === "ArrowLeft") setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : prev));
    },
    [lightboxIndex, filteredWorks.length]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [lightboxIndex]);

  // Track venue views of artist profiles
  useEffect(() => {
    if (userType === "venue" && user?.id) {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "venue_viewed_artist",
          artist_slug: artistSlug,
          venue_user_id: user.id,
        }),
      }).catch(() => {});
    }
  }, [artistSlug, user?.id, userType]);

  // Track artwork views in lightbox
  useEffect(() => {
    if (lightboxIndex !== null && filteredWorks[lightboxIndex]) {
      fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "artwork_view",
          artist_slug: artistSlug,
          work_id: filteredWorks[lightboxIndex].id || filteredWorks[lightboxIndex].title,
        }),
      }).catch(() => {});
    }
  }, [lightboxIndex, artistSlug, filteredWorks]);

  const currentWork = lightboxIndex !== null ? filteredWorks[lightboxIndex] : null;

  return (
    <>
      {/* Portfolio section */}
      <section className="py-14 lg:py-18">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl">Portfolio</h2>
            {themes.length > 0 && (
              <select
                value={activeTheme}
                onChange={(e) => setActiveTheme(e.target.value)}
                className="px-3 py-2 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
              >
                {allThemes.map((theme) => (
                  <option key={theme} value={theme}>{theme}</option>
                ))}
              </select>
            )}
          </div>

          {/* Masonry grid */}
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 sm:gap-5 space-y-3 sm:space-y-5">
            {filteredWorks.map((work, index) => (
              <div
                key={work.id}
                id={`work-${slugify(work.title)}`}
                className="break-inside-avoid group relative overflow-hidden rounded-sm bg-border/20 scroll-mt-24 cursor-pointer"
                onClick={() => setLightboxIndex(index)}
              >
                {/* Image with protection overlay */}
                <div
                  className="relative select-none"
                  onContextMenu={(e) => e.preventDefault()}
                  draggable={false}
                >
                  <Image
                    src={work.image}
                    alt={work.title}
                    width={work.orientation === "landscape" ? 750 : 600}
                    height={work.orientation === "landscape" ? 500 : work.orientation === "square" ? 600 : 750}
                    className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-500 pointer-events-none select-none"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    quality={60}
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  {/* Transparent overlay to block save-as */}
                  <div className="absolute inset-0" />

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-colors duration-300 flex items-end">
                    <div className="p-5 w-full opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                      <h3 className="text-white font-sans font-medium text-sm leading-snug mb-1">
                        {work.title}
                      </h3>
                      <p className="text-white/70 text-xs mb-1.5">
                        {work.medium} &middot; {work.dimensions}
                      </p>
                      <p className="text-white text-sm font-medium">
                        {work.priceBand}
                      </p>
                    </div>
                  </div>
                  {/* Save button */}
                  <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <SaveButton type="work" itemId={work.id} />
                  </div>
                  {/* Selection checkbox for placement (venue only) */}
                  {user && userType === "venue" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePlacementSelection(index); }}
                      className={`absolute bottom-3 left-3 w-7 h-7 rounded-full flex items-center justify-center transition-all z-10 ${
                        selectedForPlacement.has(index)
                          ? "bg-accent text-white shadow-lg"
                          : "bg-white/80 text-foreground/40 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-accent backdrop-blur-sm"
                      }`}
                      title={selectedForPlacement.has(index) ? "Deselect" : "Select for placement"}
                    >
                      {selectedForPlacement.has(index) ? (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /></svg>
                      )}
                    </button>
                  )}
                  {/* Availability */}
                  <div className="absolute top-3 right-3">
                    {work.available ? (
                      <span className="inline-block px-2 py-0.5 bg-accent/90 text-white text-[10px] rounded-sm backdrop-blur-sm">
                        Available
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 bg-black/60 text-white text-[10px] rounded-sm backdrop-blur-sm">
                        Sold
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Extended bio */}
      <section className="py-10 lg:py-14 border-t border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl mb-6">About the Artist</h2>
            <div
              className={`overflow-hidden transition-all duration-500 ${
                bioExpanded ? "max-h-[600px]" : "max-h-[4.5rem]"
              }`}
            >
              <p className="text-foreground/75 leading-relaxed">{extendedBio}</p>
            </div>
            <button
              type="button"
              onClick={() => setBioExpanded(!bioExpanded)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover transition-colors duration-200 cursor-pointer"
            >
              {bioExpanded ? "Read less" : "Read more"}
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                className={`transition-transform duration-300 ${bioExpanded ? "rotate-180" : ""}`}
              >
                <polyline points="3 5 7 9 11 5" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {currentWork && lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" />

          {/* Content */}
          <div
            className="relative z-10 flex flex-col lg:flex-row max-w-5xl w-full mx-2 sm:mx-4 max-h-[90vh] bg-white rounded-sm overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image side */}
            <div
              className="relative flex-1 min-h-[250px] sm:min-h-[350px] lg:min-h-[500px] bg-[#f5f5f3] select-none"
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
            >
              <Image
                src={currentWork.image}
                alt={currentWork.title}
                fill
                className="object-contain pointer-events-none p-4 select-none"
                sizes="(max-width: 640px) 100vw, 800px"
                quality={60}
                draggable={false}
                priority
                onContextMenu={(e) => e.preventDefault()}
              />
              {/* Transparent overlay to block save-as and right-click */}
              <div className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />

              {/* Nav arrows */}
              {lightboxIndex > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
              )}
              {lightboxIndex < filteredWorks.length - 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              )}
            </div>

            {/* Details side */}
            <div className="lg:w-80 shrink-0 p-4 sm:p-6 lg:p-8 flex flex-col border-t lg:border-t-0 lg:border-l border-border">
              {/* Close button */}
              <button
                onClick={() => setLightboxIndex(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
              </button>

              {/* Artist */}
              <p className="text-xs text-muted uppercase tracking-wider mb-1">{artistName}</p>

              {/* Title */}
              <h3 className="text-xl font-serif text-foreground leading-snug mb-3">
                {currentWork.title}
              </h3>

              {/* Details */}
              <div className="space-y-2 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Medium</span>
                  <span className="text-foreground font-medium">{currentWork.medium}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Dimensions</span>
                  <span className="text-foreground font-medium">{currentWork.dimensions}</span>
                </div>
              </div>

              {/* Availability */}
              <div className="mb-4">
                {currentWork.available ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-accent">
                    <span className="w-2 h-2 rounded-full bg-accent" />
                    Available
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                    <span className="w-2 h-2 rounded-full bg-muted" />
                    Sold
                  </span>
                )}
              </div>

              {/* Size & Price dropdown */}
              {currentWork.available && currentWork.pricing.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted uppercase tracking-wider mb-2">Size & Price</p>
                  <select
                    value={selectedSizeIdx}
                    onChange={(e) => setSelectedSizeIdx(Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-surface border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 cursor-pointer"
                  >
                    {currentWork.pricing.map((sp, i) => (
                      <option key={sp.label} value={i}>
                        {sp.label} — £{sp.price}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* CTA */}
              <div className="mt-auto space-y-2">
                {user && userType === "venue" && (
                  <button
                    onClick={() => {
                      setLightboxIndex(null);
                      router.push(`/venue-portal/placements?artist=${artistSlug}&artistName=${encodeURIComponent(artistName)}&work=${encodeURIComponent(currentWork.title)}&workImage=${encodeURIComponent(currentWork.image)}`);
                    }}
                    className="w-full px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
                  >
                    Request Placement
                  </button>
                )}
                {currentWork.available && currentWork.pricing.length > 0 && (
                  <button
                    onClick={() => {
                      const selected = currentWork.pricing[selectedSizeIdx] || currentWork.pricing[0];
                      addItem({
                        type: "work",
                        workId: currentWork.id,
                        artistSlug,
                        artistName,
                        title: currentWork.title,
                        image: currentWork.image,
                        size: selected.label,
                        price: selected.price,
                        quantity: 1,
                      });
                      setLightboxIndex(null);
                      router.push("/checkout");
                    }}
                    className="w-full px-5 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors"
                  >
                    Buy Now – £{(currentWork.pricing[selectedSizeIdx] || currentWork.pricing[0]).price}
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowEnquiry(true); setEnquirySent(false); }}
                    className="flex-1 px-5 py-2.5 text-sm font-medium text-foreground border border-border hover:border-foreground/30 rounded-sm transition-colors"
                  >
                    Message
                  </button>
                  <SaveButton type="work" itemId={currentWork.id} size="md" />
                </div>
              </div>

              {/* Counter */}
              <p className="text-[10px] text-muted text-center mt-4">
                {lightboxIndex + 1} of {filteredWorks.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Floating placement bar */}
      {user && userType === "venue" && selectedForPlacement.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-foreground/95 backdrop-blur-sm border-t border-white/10 shadow-2xl">
          <div className="max-w-[1200px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-white text-sm font-medium">{selectedForPlacement.size} work{selectedForPlacement.size !== 1 ? "s" : ""} selected</span>
              <button onClick={() => setSelectedForPlacement(new Set())} className="text-white/50 text-xs hover:text-white transition-colors">Clear</button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRequestPlacement}
                className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
              >
                Request Placement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enquiry modal */}
      {showEnquiry && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setShowEnquiry(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 bg-white rounded-sm w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowEnquiry(false)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1A1A1A" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
            </button>
            {enquirySent ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <h3 className="text-lg font-serif mb-2">Message Sent</h3>
                <p className="text-sm text-muted">Your enquiry has been sent to {artistName}. They typically respond within 48 hours.</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-serif mb-1">Message {artistName}</h3>
                <p className="text-xs text-muted mb-4">
                  {currentWork ? `Re: ${currentWork.title}` : "General enquiry"}
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const data = new FormData(form);
                    const senderName = (data.get("senderName") as string) || authDisplayName || "Anonymous";
                    try {
                      await fetch("/api/messages", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          senderId: user?.id || null,
                          senderName,
                          senderType: userType || "anonymous",
                          recipientSlug: artistSlug,
                          content: `[${data.get("enquiryType")}] ${currentWork ? `Re: ${currentWork.title} – ` : ""}${data.get("message")}`,
                        }),
                      });
                      // Also save to enquiries table for backward compatibility
                      await fetch("/api/enquiry", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          senderName,
                          senderEmail: data.get("senderEmail") || user?.email || "",
                          artistSlug,
                          workTitle: currentWork?.title || null,
                          enquiryType: data.get("enquiryType"),
                          message: data.get("message"),
                        }),
                      });
                      setEnquirySent(true);
                    } catch {
                      setEnquirySent(true);
                    }
                  }}
                  className="space-y-3"
                >
                  <input type="text" name="senderName" placeholder="Your name" required defaultValue={authDisplayName || ""} className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <input type="email" name="senderEmail" placeholder="Your email" required defaultValue={user?.email || ""} className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <select name="enquiryType" className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm text-muted focus:outline-none focus:border-accent/50">
                    <option value="venue_looking">I&apos;m a venue looking for art</option>
                    <option value="purchasing">I&apos;m interested in purchasing</option>
                    <option value="custom_piece">Request a custom piece</option>
                    <option value="general">General question</option>
                  </select>
                  <textarea name="message" placeholder="Your message..." rows={3} required className="w-full px-3 py-2.5 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50" />
                  <button type="submit" className="w-full px-5 py-2.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors">
                    Send Message
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
