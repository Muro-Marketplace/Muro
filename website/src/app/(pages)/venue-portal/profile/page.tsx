"use client";

import { useState } from "react";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { useCurrentVenue } from "@/hooks/useCurrentVenue";
import { authFetch } from "@/lib/api-client";

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
  const { venue } = useCurrentVenue();
  const [editing, setEditing] = useState<string | null>(null);
  const [freeLoan, setFreeLoan] = useState(true);
  const [revenueShare, setRevenueShare] = useState(true);
  const [directPurchase, setDirectPurchase] = useState(true);
  const [localArtists, setLocalArtists] = useState(false);
  const [styles, setStyles] = useState<string[]>(["Contemporary", "Minimal", "Photography"]);
  const [themes, setThemes] = useState<string[]>(["Nature", "City", "Architecture"]);
  const [sizes, setSizes] = useState<string[]>(["Medium (40–80cm)", "Large (80–120cm)"]);
  const [saved, setSaved] = useState(false);

  const toggleStyle = (s: string) =>
    setStyles((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  const toggleTheme = (t: string) =>
    setThemes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  const toggleSize = (s: string) =>
    setSizes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );

  const handleSave = async () => {
    try {
      const res = await authFetch("/api/venue-profile", {
        method: "PUT",
        body: JSON.stringify({
          preferred_styles: styles,
          preferred_themes: themes,
          preferred_sizes: sizes,
          interested_in_free_loan: freeLoan,
          interested_in_revenue_share: revenueShare,
          interested_in_direct_purchase: directPurchase,
          interested_in_local_artists: localArtists,
        }),
      });

      if (!res.ok) {
        alert("Failed to save profile. Please try again.");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      alert("Failed to save. Please check your connection.");
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
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={handleSave} className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors">
            Save Changes
          </button>
          {saved && <span className="text-sm text-green-600">Saved</span>}
        </div>
      </div>

      <div className="space-y-5 max-w-2xl">
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
            {[
              { label: "Venue Name", value: venue?.name || "Your Venue" },
              { label: "Venue Type", value: venue?.type || "Not set" },
              { label: "Location", value: venue?.location || "Not set" },
              { label: "Wall Space", value: venue?.wallSpace || "Not set" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted mb-1">{label}</p>
                {editing === "details" ? (
                  <input
                    type="text"
                    defaultValue={value}
                    className="w-full px-3 py-2 border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 bg-background"
                  />
                ) : (
                  <p className="text-sm text-foreground">{value}</p>
                )}
              </div>
            ))}
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
                  checked={freeLoan}
                  onChange={setFreeLoan}
                  label="Free Loan"
                />
                <Toggle
                  checked={revenueShare}
                  onChange={setRevenueShare}
                  label="Revenue Share"
                />
                <Toggle
                  checked={directPurchase}
                  onChange={setDirectPurchase}
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
                onChange={setLocalArtists}
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
            {[
              { label: "Wall Space Available", value: "~12 linear metres across 3 walls" },
              { label: "Lighting", value: "Natural light + spotlights, good north-facing light" },
              { label: "Installation Notes", value: "White plaster walls, can hang up to 15kg per point" },
              { label: "Rotation Frequency", value: "Every 3–6 months" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs font-medium text-muted mb-1">{label}</p>
                {editing === "display" ? (
                  <input
                    type="text"
                    defaultValue={value}
                    className="w-full px-3 py-2 border border-border rounded-sm text-sm text-foreground focus:outline-none focus:border-accent/50 bg-background"
                  />
                ) : (
                  <p className="text-sm text-foreground">{value}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="flex items-center gap-4">
        </div>
      </div>
    </VenuePortalLayout>
  );
}
