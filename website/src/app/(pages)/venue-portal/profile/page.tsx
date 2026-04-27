"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";
import { authFetch } from "@/lib/api-client";
import { uploadImage } from "@/lib/upload";

const STYLE_TAGS = [
  "Contemporary",
  "Abstract",
  "Minimal",
  "Figurative",
  "Landscape",
  "Urban",
  "Photography",
  "Botanical",
  "Geometric",
  "Expressionist",
];

const THEME_TAGS = [
  "Nature",
  "City",
  "People",
  "Architecture",
  "Seascape",
  "Stilllife",
  "Identity",
  "Light & Shadow",
];

const SIZE_OPTIONS = [
  "Small (up to 40cm)",
  "Medium (40–80cm)",
  "Large (80–120cm)",
  "Oversized (120cm+)",
];

// Small stand-in card that mirrors the public venue preview on /venues/[slug]
// — every field flips in real time as the user edits. Goal: make the
// editor feel like you're building the public page, not filling out a
// form in isolation.
function LivePreview({
  name,
  type,
  location,
  wallSpace,
  footfall,
  images,
  styles,
  themes,
  arrangements,
  displayWallSpace,
  displayLighting,
  displayInstall,
  displayRotation,
}: {
  name: string;
  type: string;
  location: string;
  wallSpace: string;
  footfall: string;
  images: string[];
  styles: string[];
  themes: string[];
  arrangements: string[];
  displayWallSpace: string;
  displayLighting: string;
  displayInstall: string;
  displayRotation: string;
}) {
  const hero = images[0] || "";
  return (
    <div className="text-xs">
      <div className="relative h-32 bg-border/30">
        {hero && (
          <Image src={hero} alt="" fill className="object-cover" sizes="340px" />
        )}
        {!hero && (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted">
            Add a venue photo
          </div>
        )}
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded-full">
            {images.length} photos
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground truncate">{name}</p>
          <p className="text-[11px] text-muted truncate">{[type, location].filter(Boolean).join(" · ") || "Type · Location"}</p>
        </div>

        {arrangements.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {arrangements.map((a) => (
              <span key={a} className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-sm">{a}</span>
            ))}
          </div>
        )}

        {(wallSpace || footfall) && (
          <div className="flex items-center gap-2 text-[10px] text-muted">
            {wallSpace && <span>{wallSpace}</span>}
            {wallSpace && footfall && <span className="w-0.5 h-0.5 rounded-full bg-muted" />}
            {footfall && <span>{footfall}</span>}
          </div>
        )}

        {styles.length > 0 && (
          <div>
            <p className="text-[9px] uppercase tracking-wider text-muted mb-1">Looking for</p>
            <div className="flex flex-wrap gap-1">
              {styles.slice(0, 5).map((s) => (
                <span key={s} className="text-[10px] px-1.5 py-0.5 bg-accent/5 text-accent border border-accent/20 rounded-full">{s}</span>
              ))}
              {styles.length > 5 && <span className="text-[10px] text-muted">+{styles.length - 5}</span>}
            </div>
          </div>
        )}

        {(displayWallSpace || displayLighting || displayInstall || displayRotation) && (
          <div className="pt-2 border-t border-border space-y-1">
            <p className="text-[9px] uppercase tracking-wider text-muted">Display needs</p>
            {displayWallSpace && <p className="text-[10px] text-foreground/80"><span className="text-muted">Wall:</span> {displayWallSpace}</p>}
            {displayLighting && <p className="text-[10px] text-foreground/80"><span className="text-muted">Lighting:</span> {displayLighting}</p>}
            {displayInstall && <p className="text-[10px] text-foreground/80"><span className="text-muted">Install:</span> {displayInstall}</p>}
            {displayRotation && <p className="text-[10px] text-foreground/80"><span className="text-muted">Rotation:</span> {displayRotation}</p>}
          </div>
        )}

        {themes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {themes.slice(0, 4).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 bg-surface text-muted border border-border rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors duration-200 cursor-pointer ${
          checked ? "bg-accent" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-1"
          }`}
        />
      </button>
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function TagPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-sm border transition-all duration-150 cursor-pointer ${
        active
          ? "bg-accent text-white border-accent"
          : "border-border text-muted hover:border-accent/40"
      }`}
    >
      {label}
    </button>
  );
}

export default function VenueProfilePage() {
  const { venue, refetch } = useCurrentVenue();
  const [editing, setEditing] = useState<string | null>(null);
  const [freeLoan, setFreeLoan] = useState(true);
  const [revenueShare, setRevenueShare] = useState(true);
  const [directPurchase, setDirectPurchase] = useState(true);
  const [localArtists, setLocalArtists] = useState(false);
  const [styles, setStyles] = useState<string[]>([]);
  const [themes, setThemes] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Editable venue details
  const [detailName, setDetailName] = useState("");
  const [detailType, setDetailType] = useState("");
  const [detailLocation, setDetailLocation] = useState("");
  const [detailWallSpace, setDetailWallSpace] = useState("");
  const [detailFootfall, setDetailFootfall] = useState("");

  // Display needs — driven by the saved venue record. No fake placeholder
  // values; new venues see "Not set" until they fill these in themselves.
  const [displayWallSpace, setDisplayWallSpace] = useState("");
  const [displayLighting, setDisplayLighting] = useState("");
  const [displayInstall, setDisplayInstall] = useState("");
  const [displayRotation, setDisplayRotation] = useState("");

  // Venue photos — gallery of the actual space.
  const [venueImages, setVenueImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  // Lights up the venue-photo gallery when files are being dragged
  // over it, so the drop target is obvious.
  const [dragOverGallery, setDragOverGallery] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Load preferences from venue data
  useEffect(() => {
    if (venue && !loaded) {
      setFreeLoan(venue.interestedInFreeLoan ?? true);
      setRevenueShare(venue.interestedInRevenueShare ?? true);
      setDirectPurchase(venue.interestedInDirectPurchase ?? true);
      setLocalArtists(venue.interestedInLocalArtists ?? false);
      setStyles(venue.preferredStyles?.length ? venue.preferredStyles : ["Contemporary", "Minimal", "Photography"]);
      setThemes(venue.preferredThemes?.length ? venue.preferredThemes : ["Nature", "City", "Architecture"]);
      setSizes(["Medium (40–80cm)", "Large (80–120cm)"]);
      setDetailName(venue.name || "");
      setDetailType(venue.type || "");
      setDetailLocation(venue.location || "");
      setDetailWallSpace(venue.wallSpace || "");
      setDetailFootfall(venue.approximateFootfall || "");
      setVenueImages(Array.isArray(venue.images) ? venue.images : []);
      setDisplayWallSpace(venue.displayWallSpace || "");
      setDisplayLighting(venue.displayLighting || "");
      setDisplayInstall(venue.displayInstallNotes || "");
      setDisplayRotation(venue.displayRotationFrequency || "");
      setLoaded(true);
    }
  }, [venue, loaded]);

  async function handleAddImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploadingImage(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 10 - venueImages.length)) {
        const url = await uploadImage(file, "collections");
        urls.push(url);
      }
      if (urls.length > 0) {
        setVenueImages((prev) => [...prev, ...urls]);
        markDirty();
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(url: string) {
    setVenueImages((prev) => prev.filter((u) => u !== url));
    markDirty();
  }

  // Track unsaved changes
  const markDirty = useCallback(() => setHasUnsavedChanges(true), []);

  // Warn on unload if unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const toggleStyle = (s: string) => {
    setStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    markDirty();
  };
  const toggleTheme = (t: string) => {
    setThemes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
    markDirty();
  };
  const toggleSize = (s: string) => {
    setSizes((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authFetch("/api/venue-profile", {
        method: "PUT",
        body: JSON.stringify({
          name: detailName || undefined,
          type: detailType || undefined,
          location: detailLocation || undefined,
          wall_space: detailWallSpace || undefined,
          approximate_footfall: detailFootfall || undefined,
          preferred_styles: styles,
          preferred_themes: themes,
          images: venueImages,
          interested_in_free_loan: freeLoan,
          interested_in_revenue_share: revenueShare,
          interested_in_direct_purchase: directPurchase,
          display_wall_space: displayWallSpace || undefined,
          display_lighting: displayLighting || undefined,
          display_install_notes: displayInstall || undefined,
          display_rotation_frequency: displayRotation || undefined,
        }),
      });

      if (!res.ok) {
        alert("Failed to save profile. Please try again.");
        setSaving(false);
        return;
      }

      setSaved(true);
      setHasUnsavedChanges(false);
      setEditing(null);
      refetch();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert("Failed to save. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <VenuePortalLayout>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
            Venue Profile &amp; Preferences
          </h1>
          <p className="text-sm text-muted">
            Keep your profile up to date so artists can tailor their work to your space.
          </p>
          {venue?.slug && (
            <a
              href={`/venues/${venue.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              View how artists see your profile
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={handleSave} disabled={saving} className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60">
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </div>

      {/* Two-column layout: editor on the left, a LIVE preview of the
          public venue card on the right so the user can see exactly how
          artists will see the profile as they build it. Preview stacks
          below the editor on mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8">
        <div className="space-y-5 min-w-0">
        {/* Venue Details */}
        <div className="bg-white border border-border rounded-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-serif text-base text-foreground">
              Venue Details
            </h2>
            <button
              type="button"
              onClick={() =>
                setEditing(editing === "details" ? null : "details")
              }
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              {editing === "details" ? "Cancel" : "Edit"}
            </button>
          </div>
          <div className="p-5 space-y-4">
            {([
              { label: "Venue Name", value: detailName || venue?.name || "Your Venue", setter: setDetailName, placeholder: "" },
              { label: "Venue Type", value: detailType || venue?.type || "Not set", setter: setDetailType, placeholder: "" },
              { label: "Location", value: detailLocation || venue?.location || "Not set", setter: setDetailLocation, placeholder: "" },
              { label: "Wall Space", value: detailWallSpace || venue?.wallSpace || "Not set", setter: setDetailWallSpace, placeholder: "" },
              { label: "Visitors per day (approx.)", value: detailFootfall || venue?.approximateFootfall || "Not set", setter: setDetailFootfall, placeholder: "e.g. 250" },
            ] as const).map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted mb-1">{label}</p>
                {editing === "details" ? (
                  <input
                    type="text"
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => { setter(e.target.value); markDirty(); }}
                    className="w-full px-3 py-2 border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 bg-background"
                  />
                ) : (
                  <p className="text-sm text-foreground">{value}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Venue Photos — gallery of the actual space so artists and the
            Wallplace Curated team can see what they'll be hanging in. */}
        <div className="bg-white border border-border rounded-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-serif text-base text-foreground">Venue Photos</h2>
              <p className="text-xs text-muted mt-0.5">Up to 10 images of your space. Shown on your public venue page.</p>
            </div>
            <label className="text-xs text-accent hover:underline cursor-pointer">
              {uploadingImage ? "Uploading…" : "Add photos"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                disabled={uploadingImage || venueImages.length >= 10}
                onChange={(e) => { handleAddImages(e.target.files); e.target.value = ""; }}
              />
            </label>
          </div>
          {/* Drag-drop zone wrapping the gallery — drop one or more
              photos anywhere inside the panel to upload (subject to the
              10-photo cap). */}
          <div
            className={`p-5 transition-colors ${
              dragOverGallery ? "bg-accent/5 ring-2 ring-accent/40 ring-inset" : ""
            }`}
            onDragOver={(e) => {
              if (e.dataTransfer.types?.includes("Files") && venueImages.length < 10) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                if (!dragOverGallery) setDragOverGallery(true);
              }
            }}
            onDragLeave={() => setDragOverGallery(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverGallery(false);
              if (venueImages.length >= 10) return;
              const dt = new DataTransfer();
              Array.from(e.dataTransfer.files ?? []).forEach((f) => {
                if (f.type.startsWith("image/")) dt.items.add(f);
              });
              if (dt.files.length > 0) handleAddImages(dt.files);
            }}
          >
            {venueImages.length === 0 ? (
              <p className="text-sm text-muted">
                {dragOverGallery
                  ? "Drop to upload"
                  : "No photos yet. Drag photos in or click Add photos to bring your space to life."}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {venueImages.map((url) => (
                  <div key={url} className="relative aspect-[4/3] rounded-sm overflow-hidden border border-border bg-background group">
                    <Image src={url} alt="Venue photo" fill className="object-cover" sizes="200px" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {uploadError && <p className="text-xs text-red-600 mt-3">{uploadError}</p>}
            {venueImages.length >= 10 && (
              <p className="text-[11px] text-muted mt-3">Maximum 10 photos. Remove one to add another.</p>
            )}
          </div>
        </div>

        {/* Art Preferences */}
        <div className="bg-white border border-border rounded-sm">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-serif text-base text-foreground">
              Art Preferences
            </h2>
          </div>
          <div className="p-5 space-y-6">
            {/* Commercial terms */}
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
                Interested In
              </p>
              <div className="space-y-3">
                <Toggle
                  checked={revenueShare}
                  onChange={(v) => { setRevenueShare(v); markDirty(); }}
                  label="Revenue Share"
                />
                <Toggle
                  checked={freeLoan}
                  onChange={(v) => { setFreeLoan(v); markDirty(); }}
                  label="Paid Loan"
                />
                <Toggle
                  checked={directPurchase}
                  onChange={(v) => { setDirectPurchase(v); markDirty(); }}
                  label="Direct Purchase"
                />
              </div>
            </div>

            {/* Styles */}
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
                Preferred Styles
              </p>
              <div className="flex flex-wrap gap-2">
                {STYLE_TAGS.map((tag) => (
                  <TagPill
                    key={tag}
                    label={tag}
                    active={styles.includes(tag)}
                    onClick={() => toggleStyle(tag)}
                  />
                ))}
              </div>
            </div>

            {/* Themes */}
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
                Preferred Themes
              </p>
              <div className="flex flex-wrap gap-2">
                {THEME_TAGS.map((tag) => (
                  <TagPill
                    key={tag}
                    label={tag}
                    active={themes.includes(tag)}
                    onClick={() => toggleTheme(tag)}
                  />
                ))}
              </div>
            </div>

            {/* Local artists */}
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
                Artist Location
              </p>
              <Toggle
                checked={localArtists}
                onChange={(v) => { setLocalArtists(v); markDirty(); }}
                label="Prefer artists within 10 miles of my venue"
              />
            </div>

            {/* Preferred sizes */}
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
                Preferred Artwork Sizes
              </p>
              <div className="flex flex-wrap gap-2">
                {SIZE_OPTIONS.map((size) => (
                  <TagPill
                    key={size}
                    label={size}
                    active={sizes.includes(size)}
                    onClick={() => toggleSize(size)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Display Needs */}
        <div className="bg-white border border-border rounded-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-serif text-base text-foreground">
              Display Needs
            </h2>
            <button
              type="button"
              onClick={() =>
                setEditing(editing === "display" ? null : "display")
              }
              className="text-xs text-accent hover:underline cursor-pointer"
            >
              {editing === "display" ? "Cancel" : "Edit"}
            </button>
          </div>
          <div className="p-5 space-y-4">
            {([
              { label: "Wall Space Available", value: displayWallSpace, setter: setDisplayWallSpace, placeholder: "e.g. 12 linear metres across 3 walls" },
              { label: "Lighting", value: displayLighting, setter: setDisplayLighting, placeholder: "e.g. Natural light + spotlights" },
              { label: "Installation Notes", value: displayInstall, setter: setDisplayInstall, placeholder: "e.g. Plaster walls, up to 15kg per fixing" },
              { label: "Rotation Frequency", value: displayRotation, setter: setDisplayRotation, placeholder: "e.g. Every 3 months" },
            ] as const).map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted mb-1">{label}</p>
                {editing === "display" ? (
                  <input
                    type="text"
                    value={value}
                    placeholder={placeholder}
                    onChange={(e) => { setter(e.target.value); markDirty(); }}
                    className="w-full px-3 py-2 border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 bg-background"
                  />
                ) : (
                  <p className={`text-sm ${value ? "text-foreground" : "text-muted italic"}`}>{value || "Not set"}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Save — mirrors the top Save action so users on long
            forms (lots of style tags + arrangement details + display
            specs) don't have to scroll back up to commit changes.
            Same handler as the top button. saveError lives in the
            top header so we don't double-render it. */}
        <div className="flex items-center justify-end gap-3 pt-6 border-t border-border">
          <p className="text-xs text-muted">
            Make sure to save before leaving this page.
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
        </div>

        {/* Live preview — mirrors the public /venues/[slug] card so the
            venue can see exactly how artists will see them as they edit.
            Sticky on desktop, in-line on mobile. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-white border border-border rounded-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-wider text-muted">Live preview</p>
              {venue?.slug && (
                <a href={`/venues/${venue.slug}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline">
                  Open full page
                </a>
              )}
            </div>
            <LivePreview
              name={detailName || "Your venue"}
              type={detailType || "Venue type"}
              location={detailLocation || "Location"}
              wallSpace={detailWallSpace}
              footfall={detailFootfall}
              images={venueImages}
              styles={styles}
              themes={themes}
              arrangements={[
                revenueShare && "Revenue share",
                freeLoan && "Paid loan",
                directPurchase && "Direct purchase",
              ].filter(Boolean) as string[]}
              displayWallSpace={displayWallSpace}
              displayLighting={displayLighting}
              displayInstall={displayInstall}
              displayRotation={displayRotation}
            />
          </div>
          <p className="mt-3 text-[11px] text-muted leading-relaxed">
            This is exactly what artists see on Spaces and on your public venue page. Changes show here live — don&rsquo;t forget to hit <strong className="text-foreground">Save</strong>.
          </p>
        </aside>
      </div>
    </VenuePortalLayout>
  );
}
