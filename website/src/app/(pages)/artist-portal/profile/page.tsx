"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { type ArtistWork, type Artist } from "@/data/artists";
import { themes as allThemes } from "@/data/themes";
import { uploadImage } from "@/lib/upload";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";

const primaryMediums = [
  "Oil Painting", "Watercolour", "Acrylic Painting", "Drawing & Illustration",
  "Street Photography", "Landscape Photography", "Portrait Photography",
  "Documentary Photography", "Fine Art Photography", "Abstract Photography",
  "Architectural Photography", "Still Life Photography", "Printmaking",
  "Mixed Media", "Collage", "Digital Art", "Sculpture", "Textile Art", "Other",
];

const deliveryOptions = [
  "Within 5 miles", "Within 10 miles", "Within 15 miles",
  "Central London only", "Greater London", "London + South East", "Nationwide",
];

const sizeOptions = ["A5", "A4", "A3", "A2", "A1", "50x70cm", "70x100cm", "Custom"];

const venueTypes = [
  "Cafes & Coffee Shops", "Restaurants & Bars", "Hotels & Hospitality",
  "Coworking Spaces", "Offices & Corporate", "Retail & Boutiques",
  "Creative Studios", "Events Spaces", "Healthcare & Wellness", "Any venue type",
];

interface ProfileState {
  name: string;
  location: string;
  postcode: string;
  primaryMedium: string;
  shortBio: string;
  extendedBio: string;
  instagram: string;
  website: string;
  styleTags: string[];
  themes: string[];
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
  canProvideFrames: boolean;
  canArrangeFraming: boolean;
  availableSizes: string[];
  deliveryRadius: string;
  venueTypesSuitedFor: string[];
}

function initProfile(a: Artist): ProfileState {
  return {
    name: a.name,
    location: a.location,
    postcode: a.postcode || "",
    primaryMedium: a.primaryMedium,
    shortBio: a.shortBio,
    extendedBio: a.extendedBio,
    instagram: a.instagram,
    website: a.website || "",
    styleTags: [...a.styleTags],
    themes: [...a.themes],
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
    canProvideFrames: a.canProvideFrames,
    canArrangeFraming: a.canArrangeFraming,
    availableSizes: [...a.availableSizes],
    deliveryRadius: a.deliveryRadius,
    venueTypesSuitedFor: [...a.venueTypesSuitedFor],
  };
}

export default function ProfileEditorPage() {
  const { artist, loading: artistLoading, profileId, refetch } = useCurrentArtist();
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState("");
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
    if (artist && !profile) {
      setProfile(initProfile(artist));
    }
  }, [artist, profile]);

  useEffect(() => {
    if (!artist) return;
    setWorks([...artist.works]);
  }, [artist]);

  if (artistLoading || !artist || !profile) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/profile">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found."}</p>
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
    localStorage.setItem("wallspace-artist-works", JSON.stringify(updated));
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
    setWorkForm((p) => ({ ...p, image: url }));
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
  }

  function toggleArrayItem(key: "styleTags" | "themes" | "availableSizes" | "venueTypesSuitedFor", item: string) {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: prev[key].includes(item) ? prev[key].filter((i) => i !== item) : [...prev[key], item],
      };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (!profile) return;

    // Save to Supabase
    try {
      const res = await authFetch("/api/artist-profile", {
        method: "PUT",
        body: JSON.stringify({
          name: profile.name,
          slug: artist!.slug,
          profile_image: profile.profileImage,
          banner_image: profile.bannerImage,
          short_bio: profile.shortBio,
          extended_bio: profile.extendedBio,
          location: profile.location,
          postcode: profile.postcode,
          primary_medium: profile.primaryMedium,
          style_tags: profile.styleTags,
          themes: profile.themes,
          instagram: profile.instagram,
          website: profile.website,
          offers_originals: profile.offersOriginals,
          offers_prints: profile.offersPrints,
          offers_framed: profile.offersFramed,
          available_sizes: profile.availableSizes,
          open_to_commissions: profile.openToCommissions,
          open_to_free_loan: profile.openToFreeLoan,
          open_to_revenue_share: profile.openToRevenueShare,
          revenue_share_percent: profile.revenueSharePercent,
          open_to_outright_purchase: profile.openToOutrightPurchase,
          can_provide_frames: profile.canProvideFrames,
          can_arrange_framing: profile.canArrangeFraming,
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
    localStorage.setItem("wallspace-artist-profile", JSON.stringify(profile));
    setSaved(true);
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
            <p className="text-sm text-muted mt-1">Customise how venues and buyers see you on Wallspace.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/browse/${artist.slug}`}
              target="_blank"
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Preview Profile &rarr;
            </Link>
          </div>
        </div>

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
            <div>
              <label className={labelClass}>Primary Medium</label>
              <select value={profile.primaryMedium} onChange={(e) => update("primaryMedium", e.target.value)} className={inputClass}>
                <option value="">Select</option>
                {primaryMediums.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Short Bio <span className="text-muted font-normal">({profile.shortBio.length}/300)</span></label>
              <textarea
                value={profile.shortBio}
                onChange={(e) => update("shortBio", e.target.value.slice(0, 300))}
                rows={3}
                placeholder="A brief introduction shown at the top of your profile"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <label className={labelClass}>Extended Bio</label>
              <textarea
                value={profile.extendedBio}
                onChange={(e) => update("extendedBio", e.target.value)}
                rows={5}
                placeholder="Tell your full story – background, practice, exhibitions, influences"
                className={`${inputClass} resize-none`}
              />
            </div>
          </div>
        </div>

        {/* 3. Social & Links */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-5">Social & Links</h2>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className={labelClass}>Instagram</label>
              <input type="text" value={profile.instagram} onChange={(e) => update("instagram", e.target.value)} placeholder="@yourhandle" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input type="text" value={profile.website} onChange={(e) => update("website", e.target.value)} placeholder="https://yoursite.com" className={inputClass} />
            </div>
          </div>
        </div>

        {/* 4. Style & Themes */}
        <div className={sectionClass}>
          <h2 className="text-lg font-medium mb-5">Style & Themes</h2>

          {/* Style tags */}
          <div className="mb-6">
            <label className={labelClass}>Style Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {profile.styleTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-foreground text-white rounded-sm">
                  {tag}
                  <button onClick={() => toggleArrayItem("styleTags", tag)} className="hover:text-accent transition-colors">&times;</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) {
                    e.preventDefault();
                    if (!profile.styleTags.includes(newTag.trim())) {
                      update("styleTags", [...profile.styleTags, newTag.trim()]);
                    }
                    setNewTag("");
                  }
                }}
                placeholder="Add a tag and press Enter"
                className={`${inputClass} flex-1`}
              />
            </div>
          </div>

          {/* Themes */}
          <div>
            <label className={labelClass}>Themes</label>
            <div className="flex flex-wrap gap-1.5">
              {allThemes.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => toggleArrayItem("themes", theme)}
                  className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                    profile.themes.includes(theme)
                      ? "bg-foreground text-white border-foreground"
                      : "border-border text-muted hover:border-foreground/30"
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
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
                { key: "canProvideFrames" as const, label: "Can provide frames" },
                { key: "canArrangeFraming" as const, label: "Can arrange framing" },
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
              <p className="text-xs text-muted mb-2">Optional — the % you offer venues on sales from their space. Leave at 0 for a pure free display.</p>
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

          {/* Available sizes */}
          <div className="mb-6">
            <label className={labelClass}>Available sizes</label>
            <div className="flex flex-wrap gap-1.5">
              {sizeOptions.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggleArrayItem("availableSizes", size)}
                  className={`px-3 py-1.5 text-xs rounded-sm border transition-colors ${
                    profile.availableSizes.includes(size)
                      ? "bg-foreground text-white border-foreground"
                      : "border-border text-muted hover:border-foreground/30"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

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

              {/* Image upload */}
              <div className="flex items-start gap-4">
                {workForm.image ? (
                  <div className="w-28 h-20 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                    <Image src={workForm.image} alt="Preview" fill className="object-cover" sizes="112px" />
                  </div>
                ) : (
                  <div className="w-28 h-20 rounded-sm border-2 border-dashed border-border flex items-center justify-center shrink-0">
                    <span className="text-[10px] text-muted">No image</span>
                  </div>
                )}
                <div>
                  <input ref={workImageRef} type="file" accept="image/*" onChange={handleWorkImageUpload} className="hidden" />
                  <button type="button" onClick={() => workImageRef.current?.click()} className="px-3 py-2 text-xs font-medium border border-border rounded-sm hover:border-foreground/30 transition-colors">
                    {workForm.image ? "Replace" : "Upload Image"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={workForm.title} onChange={(e) => setWorkForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title *" className={inputClass} />
                <input type="text" value={workForm.medium} onChange={(e) => setWorkForm((p) => ({ ...p, medium: e.target.value }))} placeholder="Medium *" className={inputClass} />
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

        {/* Save */}
        <div className="flex items-center gap-4 pb-10">
          <button
            onClick={handleSave}
            className="px-8 py-3.5 bg-accent text-white text-sm font-semibold tracking-wider uppercase rounded-sm hover:bg-accent-hover transition-colors"
          >
            Save Changes
          </button>
          <Link
            href={`/browse/${artist.slug}`}
            target="_blank"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Preview public profile
          </Link>
        </div>
      </div>
    </ArtistPortalLayout>
  );
}
