"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import Combobox from "@/components/Combobox";
import { type ArtistWork, type Artist } from "@/data/artists";
import { themes as allThemes } from "@/data/themes";
import { DISCIPLINES, formatSubStyleLabel, getDisciplineById, type DisciplineId } from "@/data/categories";
import { uploadImage } from "@/lib/upload";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { slugify } from "@/lib/slugify";
import { useSearchParams } from "next/navigation";

// Catalogue of common artwork mediums for the per-work Combobox. The
// list is intentionally permissive — artists almost always have edge
// cases ("oil + gold leaf", "cyanotype on cotton") so the combobox
// allows custom entries while still suggesting the standards.
export const WORK_MEDIUM_OPTIONS = [
  "Oil on canvas",
  "Oil on board",
  "Oil on linen",
  "Acrylic on canvas",
  "Acrylic on board",
  "Watercolour on paper",
  "Gouache on paper",
  "Ink on paper",
  "Pencil on paper",
  "Graphite on paper",
  "Charcoal on paper",
  "Pastel on paper",
  "Mixed media on paper",
  "Mixed media on canvas",
  "Mixed media on board",
  "Collage",
  "Linocut print",
  "Screen print",
  "Etching",
  "Lithograph",
  "Woodcut print",
  "Giclée print",
  "C-type print",
  "Archival pigment print",
  "Silver gelatin print",
  "Digital print",
  "Photograph",
  "Digital art",
  "Sculpture",
  "Ceramic",
  "Textile",
  "Other",
];

// ── Work image dropzone ────────────────────────────────────────────────

/**
 * Drag-and-drop or click-to-pick image upload for the work form.
 *
 * Behaviour:
 *   - Click anywhere on the panel to open the system file picker.
 *   - Drag a file (or paste from clipboard, supported by the browser)
 *     and the panel highlights to confirm it'll accept the drop.
 *   - Multiple files dropped → uses the first one.
 *   - Non-image dropped → ignored (the OS already filters most cases).
 *
 * Picker copy nudges users towards the broader file selection (#9):
 * macOS Safari/Chrome show the "Photos" folder by default unless the
 * user explicitly browses elsewhere — surfacing "Browse all files" in
 * the hint helps them find their iPhotos / Pictures folders. We can't
 * change the OS picker chrome itself.
 */
function WorkImageDropzone({
  imageUrl,
  inputRef,
  onChange,
  onFile,
}: {
  imageUrl: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFile: (file: File) => void | Promise<void>;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!hover) setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.type.startsWith("image/"),
        );
        if (file) onFile(file);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`flex items-center gap-4 p-3 rounded-sm border-2 border-dashed cursor-pointer transition-colors ${
        hover
          ? "border-accent bg-accent/5"
          : "border-border hover:border-foreground/30"
      }`}
    >
      {imageUrl ? (
        <div className="w-28 h-20 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
          <Image
            src={imageUrl}
            alt="Preview"
            fill
            className="object-cover"
            sizes="112px"
          />
        </div>
      ) : (
        <div className="w-28 h-20 rounded-sm bg-border/20 shrink-0 flex items-center justify-center">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="text-muted"
          >
            <path d="M12 4v12M6 10l6-6 6 6" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
        </div>
      )}
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">
          {imageUrl ? "Replace image" : "Upload image"}
        </p>
        <p className="text-[11px] text-muted mt-1 leading-snug">
          Drag &amp; drop here, or click to browse all files (Pictures,
          iPhotos, Downloads…). JPG, PNG, or WebP.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onChange}
        onClick={(e) => e.stopPropagation()}
        className="hidden"
      />
    </div>
  );
}

// ── Tags field ──────────────────────────────────────────────────────────

/**
 * Unified chip-toggle + search input. Replaces the old trio of
 * Sub-styles / Style Tags / Themes. Caller supplies the suggestion
 * pool (e.g. discipline sub-styles + canonical themes); user can pick
 * from suggestions, search to narrow, or add free-text custom tags.
 */
function TagsField({
  value,
  onChange,
  suggestions,
  formatSuggestion,
  label,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
  formatSuggestion?: (raw: string) => string;
  label: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");

  const fmt = formatSuggestion ?? ((s: string) => s);

  // Suggestions filtered by current search, with already-selected
  // entries pulled out (they appear above as filled chips).
  const filteredSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s))
      .filter((s) =>
        q
          ? s.toLowerCase().includes(q) || fmt(s).toLowerCase().includes(q)
          : true,
      );
  }, [suggestions, value, query, fmt]);

  const trimmedQuery = query.trim();
  const showAddCustom =
    trimmedQuery.length > 0 &&
    !value.some((v) => v.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !suggestions.some((s) => s.toLowerCase() === trimmedQuery.toLowerCase());

  function add(tag: string) {
    if (!tag.trim()) return;
    if (value.includes(tag)) return;
    onChange([...value, tag]);
    setQuery("");
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-2">
        {label}
      </label>

      {/* Selected chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-foreground text-white rounded-sm"
            >
              {fmt(tag)}
              <button
                type="button"
                onClick={() => remove(tag)}
                className="hover:text-accent transition-colors"
                aria-label={`Remove ${fmt(tag)}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search + add-custom input */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmedQuery) {
              e.preventDefault();
              add(trimmedQuery);
            }
          }}
          placeholder={placeholder}
          className="w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors"
        />
        {showAddCustom && (
          <button
            type="button"
            onClick={() => add(trimmedQuery)}
            className="shrink-0 px-3 py-2 text-xs font-medium text-accent border border-accent/40 rounded-sm hover:bg-accent/5 transition-colors"
          >
            + Add &ldquo;{trimmedQuery}&rdquo;
          </button>
        )}
      </div>

      {/* Suggestion chips */}
      {filteredSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="px-3 py-1.5 text-xs rounded-sm border border-border text-muted hover:border-foreground/30 hover:text-foreground transition-colors"
            >
              {fmt(s)}
            </button>
          ))}
        </div>
      )}
      {filteredSuggestions.length === 0 && trimmedQuery && !showAddCustom && (
        <p className="text-xs text-muted">
          All matching tags are already added.
        </p>
      )}
    </div>
  );
}

// Catalogue of common artwork mediums for the per-work Combobox. The

const deliveryOptions = [
  "Within 5 miles", "Within 10 miles", "Within 15 miles",
  "Central London only", "Greater London", "London + South East", "Nationwide",
];

const venueTypes = [
  "Cafes & Coffee Shops", "Restaurants & Bars", "Hotels & Hospitality",
  "Coworking Spaces", "Offices & Corporate", "Retail & Boutiques",
  "Creative Studios", "Events Spaces", "Healthcare & Wellness", "Any venue type",
];

interface ProfileState {
  name: string;
  location: string;
  postcode: string;
  /**
   * `primaryMedium` is retained on the state so the saved API payload
   * doesn't break older rows, but it's not surfaced in the UI any
   * more — Discipline is the canonical taxonomy field. New profiles
   * leave it as "".
   */
  primaryMedium: string;
  discipline: DisciplineId | "";
  /**
   * Single bio field. The first 300 characters become the public short
   * bio (shown on cards / search hits); the full text is the extended
   * bio (shown on the artist's full page). Two separate fields used to
   * exist — they were redundant and forced artists to write the same
   * thing twice.
   */
  bio: string;
  instagram: string;
  /**
   * Unified tags array — replaces the previous trio of `subStyles`,
   * `styleTags`, and `themes` which were three near-identical chip
   * lists in the UI. At save time we split this list back into the
   * three DB columns so older readers (search filters, browse pages)
   * keep matching:
   *   - sub_styles  = entries that match the current discipline's
   *                   allowed sub-styles
   *   - themes      = entries that match the canonical themes list
   *   - style_tags  = the full list (catch-all)
   */
  tags: string[];
  bannerImage: string;
  profileImage: string;
  offersOriginals: boolean;
  offersPrints: boolean;
  offersFramed: boolean;
  openToCommissions: boolean;
  openToFreeLoan: boolean;
  openToRevenueShare: boolean;
  revenueSharePercent: number;
  openToOutrightPurchase: boolean;
  /**
   * Single "can provide framing" flag. Replaces the previous pair
   * (`canProvideFrames` + `canArrangeFraming`) which were confusingly
   * close in meaning. Save handler writes both DB columns to true when
   * this is set so existing search filters don't break.
   */
  canProvideFraming: boolean;
  /**
   * Available sizes used to be a profile-level chip set. Removed from
   * the UI per #6 — sizes belong on individual works, not the profile.
   * State retained so the API payload doesn't drop the column on
   * existing rows; we just leave whatever was there alone.
   */
  availableSizes: string[];
  deliveryRadius: string;
  venueTypesSuitedFor: string[];
}

/** Empty profile state for a brand-new artist who has just completed
 *  the claim flow but doesn't yet have a saved artist_profiles row —
 *  so the editor can render the full form instead of a dead-end.
 *  First Save PUTs this to the API, which upserts a new row. */
function emptyProfile(nameSeed: string): ProfileState {
  return {
    name: nameSeed,
    location: "",
    postcode: "",
    primaryMedium: "",
    discipline: "",
    bio: "",
    instagram: "",
    tags: [],
    bannerImage: "",
    profileImage: "",
    offersOriginals: false,
    offersPrints: false,
    offersFramed: false,
    openToCommissions: false,
    openToFreeLoan: false,
    openToRevenueShare: false,
    revenueSharePercent: 10,
    openToOutrightPurchase: false,
    canProvideFraming: false,
    availableSizes: [],
    deliveryRadius: "",
    venueTypesSuitedFor: [],
  };
}

function initProfile(a: Artist): ProfileState {
  // Merge the legacy short/extended bios into a single field. Prefer
  // the longer "extended" bio when both exist; otherwise fall back to
  // the short one. New saves write to both columns to keep older
  // consumers happy.
  const mergedBio = a.extendedBio?.trim() || a.shortBio?.trim() || "";
  // Merge the legacy trio (sub-styles, style tags, themes) into a
  // single de-duped tags array — that's what the new UI works with.
  const mergedTags = Array.from(
    new Set<string>([
      ...(a.subStyles || []),
      ...(a.styleTags || []),
      ...(a.themes || []),
    ]),
  );
  return {
    name: a.name,
    location: a.location,
    postcode: a.postcode || "",
    primaryMedium: a.primaryMedium,
    discipline: a.discipline || "",
    bio: mergedBio,
    instagram: a.instagram,
    tags: mergedTags,
    bannerImage: a.works[0]?.image || "",
    profileImage: a.image,
    offersOriginals: a.offersOriginals,
    offersPrints: a.offersPrints,
    offersFramed: a.offersFramed,
    openToCommissions: a.openToCommissions,
    openToFreeLoan: a.openToFreeLoan,
    openToRevenueShare: a.openToRevenueShare,
    revenueSharePercent: a.revenueSharePercent || 10,
    openToOutrightPurchase: a.openToOutrightPurchase,
    // Treat the legacy pair as "either provides framing" — collapse to
    // the new single flag.
    canProvideFraming: a.canProvideFrames || a.canArrangeFraming,
    availableSizes: [...a.availableSizes],
    deliveryRadius: a.deliveryRadius,
    venueTypesSuitedFor: [...a.venueTypesSuitedFor],
  };
}

export default function ProfileEditorPage() {
  const { artist, loading: artistLoading, profileId, refetch } = useCurrentArtist();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isWelcome = searchParams?.get("welcome") === "1";
  const [profile, setProfile] = useState<ProfileState | null>(null);
  // Derive a slug up-front so we can save a brand-new profile that has
  // no artist_profiles row yet. Prefer the profile's existing slug,
  // then user metadata, then the display name, then the email prefix.
  const derivedSlug = (() => {
    if (artist?.slug) return artist.slug;
    const metaSlug = (user?.user_metadata?.artist_slug as string | undefined) || "";
    if (metaSlug) return metaSlug;
    const displayName = (user?.user_metadata?.display_name as string | undefined) || "";
    if (displayName) return slugify(displayName) || `artist-${Date.now()}`;
    const emailPrefix = (user?.email || "").split("@")[0];
    return slugify(emailPrefix) || `artist-${Date.now()}`;
  })();
  const [saved, setSaved] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);

  // All hooks must be declared before any conditional returns
  const [works, setWorks] = useState<ArtistWork[]>([]);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [editingWorkIndex, setEditingWorkIndex] = useState<number | null>(null);
  const [workForm, setWorkForm] = useState<{ title: string; medium: string; dimensions: string; image: string; orientation: "portrait" | "landscape" | "square"; available: boolean; sizes: { label: string; price: number }[] }>({ title: "", medium: "", dimensions: "", image: "", orientation: "landscape", available: true, sizes: [{ label: '8\u00d710" (A4)', price: 0 }] });
  const workImageRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (profile) return;
    if (artist) {
      setProfile(initProfile(artist));
      return;
    }
    // Once auth is loaded and we know there's no artist row yet, seed
    // an empty form so a brand-new user coming from /apply/claim can
    // fill out their full profile instead of hitting a dead-end page.
    if (!artistLoading && user) {
      const seedName = (user.user_metadata?.display_name as string | undefined)
        || (user.email || "").split("@")[0]
        || "";
      setProfile(emptyProfile(seedName));
    }
  }, [artist, artistLoading, profile, user]);

  useUnsavedWarning(hasUnsavedChanges);

  useEffect(() => {
    if (!artist) { setWorks([]); return; }
    setWorks([...artist.works]);
  }, [artist]);

  if (artistLoading || !profile) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/profile">
        <p className="text-muted text-sm py-12 text-center">Loading...</p>
      </ArtistPortalLayout>
    );
  }

  async function handleFileUpload(field: "bannerImage" | "profileImage", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadImage(file, "avatars");
    update(field, url);
    setUploading(false);
  }

  function saveWorks(updated: ArtistWork[]) {
    setWorks(updated);
    localStorage.setItem("wallplace-artist-works", JSON.stringify(updated));
  }

  function openAddWork() {
    setWorkForm({ title: "", medium: "", dimensions: "", image: "", orientation: "landscape", available: true, sizes: [{ label: '8\u00d710" (A4)', price: 0 }] });
    setEditingWorkIndex(null);
    setShowWorkForm(true);
  }

  function openEditWork(index: number) {
    const w = works[index];
    setWorkForm({ title: w.title, medium: w.medium, dimensions: w.dimensions, image: w.image, orientation: w.orientation || "landscape", available: w.available, sizes: w.pricing.map((p) => ({ label: p.label, price: p.price })) });
    setEditingWorkIndex(index);
    setShowWorkForm(true);
  }

  async function handleWorkImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadImage(file, "artworks");

    // Read the image's natural dimensions in parallel — used to set
    // orientation automatically + suggest a dimensions string the user
    // can refine. Without this, replacing an image left the form's
    // orientation pointing at the *previous* image's aspect ratio.
    const detected = await new Promise<{
      orientation: "landscape" | "portrait" | "square";
    } | null>((resolve) => {
      try {
        const img = new globalThis.Image();
        img.onload = () => {
          const ratio = img.naturalWidth / img.naturalHeight;
          if (ratio > 1.05) resolve({ orientation: "landscape" });
          else if (ratio < 0.95) resolve({ orientation: "portrait" });
          else resolve({ orientation: "square" });
        };
        img.onerror = () => resolve(null);
        img.src = url;
      } catch {
        resolve(null);
      }
    });

    setWorkForm((p) => ({
      ...p,
      image: url,
      // Replace orientation based on the new image. If the user typed a
      // dimensions string already, keep it (they may know better than
      // pixel aspect — a print can crop differently). Otherwise leave
      // dimensions blank so they can fill it in fresh.
      orientation: detected?.orientation ?? p.orientation,
    }));
    setUploading(false);
  }

  function submitWork() {
    const validSizes = workForm.sizes.filter((s) => s.label && s.price > 0);
    if (!workForm.title || !workForm.medium || validSizes.length === 0) return;
    const lowestPrice = Math.min(...validSizes.map((s) => s.price));
    const newWork: ArtistWork = {
      id: editingWorkIndex !== null ? works[editingWorkIndex].id : `${artist!.slug}-${Date.now()}`,
      title: workForm.title, medium: workForm.medium, dimensions: workForm.dimensions,
      priceBand: `From \u00a3${lowestPrice}`,
      pricing: validSizes.map((s) => ({ label: s.label, price: s.price })),
      available: workForm.available, color: "#C17C5A",
      image: workForm.image || "https://picsum.photos/seed/new-work/900/600",
      orientation: workForm.orientation,
    };
    const updated = editingWorkIndex !== null ? works.map((w, i) => (i === editingWorkIndex ? newWork : w)) : [...works, newWork];
    saveWorks(updated);
    setShowWorkForm(false);
  }

  function update<K extends keyof ProfileState>(key: K, value: ProfileState[K]) {
    setProfile((prev) => prev ? { ...prev, [key]: value } : prev);
    setSaved(false);
    setHasUnsavedChanges(true);
  }

  function toggleArrayItem(key: "tags" | "availableSizes" | "venueTypesSuitedFor", item: string) {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: prev[key].includes(item) ? prev[key].filter((i) => i !== item) : [...prev[key], item],
      };
    });
    setSaved(false);
    setHasUnsavedChanges(true);
  }

  async function handleSave() {
    if (!profile) return;

    // Save to Supabase. upsertArtistProfile handles both "first save for
    // a freshly-claimed account" (no existing row yet) and "update
    // existing profile", so we don't need a separate path for new users.
    try {
      // Bio: split single field back into short (≤300 chars for cards)
      // and extended (full text). New rows get both columns populated.
      const shortBio = profile.bio.slice(0, 300).trim();
      const extendedBio = profile.bio.trim();

      // Tags: split unified list into the three legacy columns so
      // older readers (browse filters, public pages) keep matching.
      const allowedSubStyles = new Set<string>(
        getDisciplineById(profile.discipline as DisciplineId | "" || "")?.subStyles ?? [],
      );
      const allowedThemes = new Set<string>(allThemes);
      const subStyles = profile.tags.filter((t) => allowedSubStyles.has(t));
      const themes = profile.tags.filter((t) => allowedThemes.has(t));
      // style_tags is the full list (catch-all + custom entries).
      const styleTags = profile.tags;

      const res = await authFetch("/api/artist-profile", {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          slug: artist?.slug || derivedSlug,
          profile_image: profile.profileImage,
          banner_image: profile.bannerImage,
          short_bio: shortBio,
          extended_bio: extendedBio,
          location: profile.location,
          postcode: profile.postcode,
          primary_medium: profile.primaryMedium,
          discipline: profile.discipline || null,
          sub_styles: subStyles,
          style_tags: styleTags,
          themes: themes,
          instagram: profile.instagram,
          // Website removed from UI (#2). Send empty so existing rows
          // get cleared rather than retaining a stale value.
          website: "",
          offers_originals: profile.offersOriginals,
          offers_prints: profile.offersPrints,
          offers_framed: profile.offersFramed,
          available_sizes: profile.availableSizes,
          open_to_commissions: profile.openToCommissions,
          open_to_free_loan: profile.openToFreeLoan,
          open_to_revenue_share: profile.openToRevenueShare,
          revenue_share_percent: profile.revenueSharePercent,
          open_to_outright_purchase: profile.openToOutrightPurchase,
          // Single framing flag drives both legacy columns so existing
          // search filters keep matching.
          can_provide_frames: profile.canProvideFraming,
          can_arrange_framing: profile.canProvideFraming,
          delivery_radius: profile.deliveryRadius,
          venue_types_suited_for: profile.venueTypesSuitedFor,
        }),
      });

      if (!res.ok) {
        alert("Failed to save profile. Please try again.");
        return;
      }
    } catch (err) {
      console.error("Profile save error:", err);
      alert("Failed to save profile. Please check your connection.");
      return;
    }

    // Also keep localStorage as fallback
    localStorage.setItem("wallplace-artist-profile", JSON.stringify(profile));
    setSaved(true);
    setHasUnsavedChanges(false);
    refetch();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";
  const labelClass = "block text-sm font-medium text-foreground mb-2";
  const sectionClass = "pb-10 mb-10 border-b border-border";

  return (
    <ArtistPortalLayout activePath="/artist-portal/profile">
      <div className="max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif">Edit Profile</h1>
            <p className="text-sm text-muted mt-1">Customise how venues and buyers see you on Wallplace.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
            >
              Save Changes
            </button>
            {artist?.slug && (
              <Link
                href={`/browse/${artist.slug}`}
                target="_blank"
                className="text-sm text-accent hover:text-accent-hover transition-colors"
              >
                Preview Profile &rarr;
              </Link>
            )}
          </div>
        </div>

        {/* First-time welcome — surfaced when the user arrives from the
            claim flow. Keeps the "you're approved once admin reviews
            you" expectation visible while the user fills everything in. */}
        {isWelcome && (
          <div className="mb-6 bg-accent/5 border border-accent/20 rounded-sm p-4">
            <p className="text-sm font-medium text-foreground">Build your full profile</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              You can fill everything out now — photos, statement, works, pricing.
              Your profile only goes live on the marketplace once our team has
              approved your application, so there&rsquo;s no rush, but the more
              complete it is the faster the review.
            </p>
          </div>
        )}

        {/* Save success */}
        {saved && (
          <div className="mb-6 bg-accent/5 border border-accent/20 rounded-sm p-4 flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            <p className="text-sm text-foreground">Profile saved successfully.</p>
          </div>
        )}

        {/* 1. Banner & Profile Photo */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-5">Banner & Profile Photo</h2>

          {/* Banner */}
          <div className="mb-5">
            <label className={labelClass}>Banner Image</label>
            <div className="relative h-40 rounded-sm overflow-hidden bg-border/20 mb-3 group cursor-pointer" onClick={() => bannerInputRef.current?.click()}>
              {profile.bannerImage ? (
                <Image src={profile.bannerImage} alt="Banner" fill className="object-cover" sizes="800px" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm text-muted">Click to upload banner</span>
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">Change Banner</span>
              </div>
            </div>
            <input ref={bannerInputRef} type="file" accept="image/*" onChange={(e) => handleFileUpload("bannerImage", e)} className="hidden" />
          </div>

          {/* Profile pic */}
          <div>
            <label className={labelClass}>Profile Photo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-border/20 relative shrink-0 group cursor-pointer" onClick={() => profilePicInputRef.current?.click()}>
                {profile.profileImage ? (
                  <Image src={profile.profileImage} alt="Profile" fill className="object-cover" sizes="80px" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] text-muted">Upload</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 rounded-full transition-colors flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" className="opacity-0 group-hover:opacity-100 transition-opacity"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
              </div>
              <div>
                <button type="button" onClick={() => profilePicInputRef.current?.click()} className="text-sm text-accent hover:text-accent-hover transition-colors">
                  Upload photo
                </button>
                <p className="text-[10px] text-muted mt-0.5">Square image recommended</p>
              </div>
            </div>
            <input ref={profilePicInputRef} type="file" accept="image/*" onChange={(e) => handleFileUpload("profileImage", e)} className="hidden" />
          </div>
        </div>

        {/* 2. Identity */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-5">About You</h2>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Name</label>
                <input type="text" value={profile.name} onChange={(e) => update("name", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Location <span className="text-muted font-normal">(city or area)</span></label>
                <input type="text" value={profile.location} onChange={(e) => update("location", e.target.value)} placeholder="e.g. Hackney, London" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Postcode <span className="text-muted font-normal">(used for distance search)</span></label>
                <input
                  type="text"
                  value={profile.postcode}
                  onChange={(e) => update("postcode", e.target.value.toUpperCase())}
                  placeholder="e.g. E8 1DY"
                  className={inputClass}
                />
              </div>
            </div>
            {/*
             * Primary Medium removed — Discipline (in the section
             * below) is the canonical taxonomy field and was duplicated.
             *
             * Bio: single field. The first 300 characters become the
             * card-level "short" bio at save time; the full text becomes
             * the extended bio.
             */}
            <div>
              <label className={labelClass}>
                Bio
                <span className="text-muted font-normal ml-2 text-xs">
                  First 300 characters used as your short bio on cards
                  &mdash; the rest shows on your full profile.
                </span>
              </label>
              <textarea
                value={profile.bio}
                onChange={(e) => update("bio", e.target.value)}
                rows={6}
                placeholder="Tell your story — background, practice, exhibitions, influences. The opening lines should grip."
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* 3. Instagram (Website removed — wasn't surfaced publicly) */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-5">Social</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Instagram</label>
              <input type="text" value={profile.instagram} onChange={(e) => update("instagram", e.target.value)} placeholder="@yourhandle" className={inputClass} />
            </div>
          </div>
        </div>



        {/* 4. Discipline + Tags (merged) */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-2">Discipline & Tags</h2>
          <p className="text-xs text-muted mb-5">
            Pick the discipline your work sits in, then add tags that
            describe it. Venues browse by these. Suggestions are based on
            your discipline — search to narrow down or type any custom tag.
          </p>

          {/* Discipline radio group */}
          <div className="mb-6">
            <label className={labelClass}>Discipline</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DISCIPLINES.map((d) => {
                const selected = profile.discipline === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setProfile((prev) =>
                        prev ? { ...prev, discipline: d.id } : prev,
                      );
                      setSaved(false);
                      setHasUnsavedChanges(true);
                    }}
                    className={`px-3 py-2.5 text-sm text-left rounded-sm border transition-colors ${
                      selected
                        ? "border-accent bg-accent/5 text-foreground"
                        : "border-border text-muted hover:border-foreground/30"
                    }`}
                    aria-pressed={selected}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-3 h-3 rounded-full border flex-shrink-0 ${
                          selected ? "border-accent bg-accent" : "border-border"
                        }`}
                      />
                      {d.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unified Tags — replaces the previous trio of Sub-styles +
              Style Tags + Themes. Suggestions = discipline sub-styles +
              all themes (de-duped). The search box filters suggestions
              and lets users add anything custom via Enter or the
              "+ add" affordance. */}
          <TagsField
            value={profile.tags}
            onChange={(next) => update("tags", next)}
            suggestions={(() => {
              const discSubs =
                getDisciplineById(profile.discipline)?.subStyles ?? [];
              return Array.from(new Set([...discSubs, ...allThemes]));
            })()}
            formatSuggestion={formatSubStyleLabel}
            label="Tags"
            placeholder="Search or add a tag…"
          />
        </div>

        {/* 5. Commercial Terms */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-5">Commercial Terms</h2>

          {/* Offering toggles */}
          <div className="mb-6">
            <label className={labelClass}>What you offer</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {([
                { key: "offersOriginals" as const, label: "Original works" },
                { key: "offersPrints" as const, label: "Prints & reproductions" },
                { key: "offersFramed" as const, label: "Framed works" },
                { key: "openToCommissions" as const, label: "Commissions" },
                // Single "framing" affirmative — replaces the previous
                // "can provide frames" + "can arrange framing" pair,
                // which were saying nearly the same thing in two ways.
                { key: "canProvideFraming" as const, label: "Can provide framing" },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                  <button
                    type="button"
                    onClick={() => update(key, !profile[key])}
                    className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                      profile[key] ? "bg-accent border-accent" : "bg-white border-border"
                    }`}
                  >
                    {profile[key] && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
                  </button>
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Deal types */}
          <div className="mb-6">
            <label className={labelClass}>Deal types</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "openToFreeLoan" as const, label: "Display (with optional revenue share)" },
                { key: "openToOutrightPurchase" as const, label: "Purchase" },
              ]).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
                  <button
                    type="button"
                    onClick={() => update(key, !profile[key])}
                    className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                      profile[key] ? "bg-accent border-accent" : "bg-white border-border"
                    }`}
                  >
                    {profile[key] && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
                  </button>
                  <span className="text-sm text-foreground group-hover:text-accent transition-colors">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Revenue share % */}
          {profile.openToFreeLoan && (
            <div className="mb-6">
              <label className={labelClass}>Revenue share for venues (%)</label>
              <p className="text-xs text-muted mb-2">Optional: the % you offer venues on sales from their space. Leave at 0 for a pure free display.</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={profile.revenueSharePercent}
                  onChange={(e) => update("revenueSharePercent", Number(e.target.value) || 0)}
                  className="w-24 bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground text-center focus:outline-none focus:border-accent/60"
                />
                <span className="text-sm text-muted">%</span>
              </div>
            </div>
          )}

          {/* Available sizes section removed — sizes belong on
              individual works (Sizes & Prices on each work form), not
              the profile. Profile-level sizes were never surfaced
              meaningfully and forced artists to duplicate information. */}

          {/* Delivery */}
          <div className="mb-6">
            <label className={labelClass}>Delivery radius</label>
            <select value={profile.deliveryRadius} onChange={(e) => update("deliveryRadius", e.target.value)} className={inputClass}>
              <option value="">Select</option>
              {deliveryOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>

          {/* Venue types */}
          <div>
            <label className={labelClass}>Venue types suited to your work</label>
            <div className="grid grid-cols-2 gap-2">
              {venueTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleArrayItem("venueTypesSuitedFor", type)}
                  className={`px-3 py-2 text-xs text-left rounded-sm border transition-colors ${
                    profile.venueTypesSuitedFor.includes(type)
                      ? "bg-accent text-white border-accent"
                      : "border-border text-muted hover:border-accent/30"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 6. Works */}
        <div className={sectionClass}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-medium">Your Works</h2>
            <button type="button" onClick={openAddWork} className="text-sm text-accent hover:text-accent-hover transition-colors">
              + Add Work
            </button>
          </div>

          {/* Add/Edit Work Form */}
          {showWorkForm && (
            <div className="bg-background border border-border rounded-sm p-5 mb-5 space-y-4">
              <h3 className="text-sm font-medium">{editingWorkIndex !== null ? "Edit Work" : "Add New Work"}</h3>

              {/* Image upload — clickable + drag-drop target. Drop a
                  file from Finder / Explorer / iPhotos and it uploads
                  the same way as the file-picker path. The whole zone
                  is the drop target so users don't have to aim at a
                  small button. */}
              <WorkImageDropzone
                imageUrl={workForm.image}
                inputRef={workImageRef}
                onChange={handleWorkImageUpload}
                onFile={async (file) => {
                  // Mirror the existing handler's logic (upload +
                  // detect orientation) by synthesising a fake event.
                  // Keeps a single source of truth for the upload flow
                  // and dimension auto-detection.
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  const fakeEvent = {
                    target: { files: dt.files },
                  } as unknown as React.ChangeEvent<HTMLInputElement>;
                  await handleWorkImageUpload(fakeEvent);
                }}
              />

              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={workForm.title} onChange={(e) => setWorkForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title *" className={inputClass} />
                {/* Medium — searchable + mandatory combobox. Suggests
                    standard mediums (oil, acrylic, watercolour…) but
                    accepts free text via "Use 'foo'" for one-off
                    techniques. Required to submit. */}
                <Combobox
                  value={workForm.medium}
                  onChange={(next) => setWorkForm((p) => ({ ...p, medium: next }))}
                  options={WORK_MEDIUM_OPTIONS}
                  allowCustom
                  required
                  placeholder="Medium * (search or type)"
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={workForm.dimensions} onChange={(e) => setWorkForm((p) => ({ ...p, dimensions: e.target.value }))} placeholder="Dimensions" className={inputClass} />
                <select value={workForm.orientation} onChange={(e) => setWorkForm((p) => ({ ...p, orientation: e.target.value as "portrait" | "landscape" | "square" }))} className={inputClass}>
                  <option value="landscape">Landscape</option>
                  <option value="portrait">Portrait</option>
                  <option value="square">Square</option>
                </select>
              </div>

              {/* Sizes & Prices */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">Sizes & Prices *</span>
                  <button type="button" onClick={() => setWorkForm((p) => ({ ...p, sizes: [...p.sizes, { label: "", price: 0 }] }))} className="text-[10px] text-accent hover:text-accent-hover">+ Add size</button>
                </div>
                <div className="space-y-1.5">
                  {workForm.sizes.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={s.label} onChange={(e) => setWorkForm((p) => ({ ...p, sizes: p.sizes.map((sz, j) => j === i ? { ...sz, label: e.target.value } : sz) }))} placeholder='e.g. 12×16" (A3)' className={`${inputClass} flex-1`} />
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted">&pound;</span>
                        <input type="number" min={0} value={s.price || ""} onChange={(e) => setWorkForm((p) => ({ ...p, sizes: p.sizes.map((sz, j) => j === i ? { ...sz, price: Number(e.target.value) || 0 } : sz) }))} placeholder="Price" className="w-20 bg-background border border-border rounded-sm px-2 py-3 text-sm text-right focus:outline-none focus:border-accent/60" />
                      </div>
                      {workForm.sizes.length > 1 && (
                        <button type="button" onClick={() => setWorkForm((p) => ({ ...p, sizes: p.sizes.filter((_, j) => j !== i) }))} className="text-muted hover:text-red-500 shrink-0">
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => setWorkForm((p) => ({ ...p, available: !p.available }))} className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${workForm.available ? "bg-accent border-accent" : "bg-white border-border"}`}>
                  {workForm.available && <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>}
                </button>
                <span className="text-sm">Available for purchase</span>
              </label>

              <div className="flex gap-2">
                <button onClick={submitWork} disabled={!workForm.title || !workForm.medium || workForm.sizes.filter((s) => s.label && s.price > 0).length === 0} className="px-5 py-2 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {editingWorkIndex !== null ? "Save" : "Add Work"}
                </button>
                <button onClick={() => setShowWorkForm(false)} className="px-5 py-2 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Works grid */}
          {works.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {works.map((work, index) => (
                <div key={work.id} className="group relative rounded-sm overflow-hidden border border-border cursor-pointer" onClick={() => openEditWork(index)}>
                  <div className="aspect-square relative bg-border/20">
                    <Image src={work.image} alt={work.title} fill className="object-cover" sizes="120px" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                      <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">Edit</span>
                    </div>
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] font-medium truncate">{work.title}</p>
                    <p className="text-[9px] text-muted">{work.priceBand}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-8">No works yet. Add your first piece above.</p>
          )}
        </div>

        {/* 7. Collections */}
        <div className={sectionClass}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-medium">Collections</h2>
            <Link href="/artist-portal/collections" className="text-sm text-accent hover:text-accent-hover transition-colors">
              + Create Collection
            </Link>
          </div>
          <p className="text-sm text-muted mb-4">Bundle works into themed collections at a set price. Manage collections from the dedicated page.</p>
          <Link href="/artist-portal/collections" className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium border border-border text-foreground rounded-sm hover:border-foreground/30 transition-colors">
            Manage Collections
          </Link>
        </div>

        {/*
         * Bottom Save Changes — duplicates the top button so users on
         * a long edit page don't have to scroll back up after filling
         * everything out. Same handler; same disabled-when-clean
         * affordance via hasUnsavedChanges.
         */}
        <div className="flex items-center justify-between gap-4 py-6 border-t border-border">
          <p className="text-xs text-muted">
            {hasUnsavedChanges
              ? "You have unsaved changes."
              : "All changes saved."}
          </p>
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
            className="px-6 py-3 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Changes
          </button>
        </div>

      </div>
    </ArtistPortalLayout>
  );
}
