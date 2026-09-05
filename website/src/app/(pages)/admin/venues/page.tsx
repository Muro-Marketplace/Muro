"use client";

// G9. This panel had one button on it, the expand chevron, and called nothing
// that wrote: approve, suspend, edit and remove were all missing.
//
// Publish state is not fixable here. `venue_profiles` has no review or
// suspension column, unlike artist_profiles.review_status, so suspending a
// venue needs a migration rather than a button. Editing does not, and it is the
// case that actually comes up: a venue writes in to say the contact or the
// address is wrong and an admin had to go into Supabase to change it.

import { useCallback, useState, useEffect } from "react";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { ARRANGEMENT_LABEL } from "@/lib/arrangement-labels";

interface VenueRow {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  type: string;
  location: string;
  city?: string;
  postcode?: string;
  address_line1?: string;
  address_line2?: string;
  contact_name: string;
  email?: string;
  phone?: string;
  wall_space?: string;
  description?: string;
  image?: string;
  images?: string[];
  approximate_footfall?: string;
  audience_type?: string;
  interested_in_free_loan?: boolean;
  interested_in_revenue_share?: boolean;
  interested_in_direct_purchase?: boolean;
  preferred_styles?: string[];
  preferred_themes?: string[];
  display_wall_space?: string;
  display_lighting?: string;
  display_install_notes?: string;
  display_rotation_frequency?: string;
  placement_count?: number;
  created_at: string;
}

// The fields the admin PATCH accepts, in the order they are shown. Kept in
// step with the route's allowlist by hand: offering an admin a box that the
// endpoint will 400 on is worse than not offering it.
const EDITABLE: { key: EditableKey; label: string; multiline?: boolean }[] = [
  { key: "name", label: "Venue name" },
  { key: "type", label: "Type" },
  { key: "contact_name", label: "Contact name" },
  { key: "email", label: "Contact email" },
  { key: "phone", label: "Phone" },
  { key: "address_line1", label: "Address line 1" },
  { key: "address_line2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "postcode", label: "Postcode" },
  { key: "location", label: "Location" },
  { key: "approximate_footfall", label: "Footfall" },
  { key: "audience_type", label: "Audience" },
  { key: "wall_space", label: "Wall space", multiline: true },
  { key: "description", label: "Description", multiline: true },
];

type EditableKey =
  | "name"
  | "type"
  | "contact_name"
  | "email"
  | "phone"
  | "address_line1"
  | "address_line2"
  | "city"
  | "postcode"
  | "location"
  | "approximate_footfall"
  | "audience_type"
  | "wall_space"
  | "description";

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/admin/venues");
      if (res.ok) {
        const data = await res.json();
        setVenues(data.venues || []);
      } else {
        setError("Could not load the venue list.");
      }
    } catch (err) {
      console.error("Failed to load venues:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only the fields that actually changed are sent, so an admin fixing a
  // postcode does not rewrite the venue's description with a stale copy of it.
  async function saveVenue(venue: VenueRow, changed: Partial<Record<EditableKey, string>>) {
    if (Object.keys(changed).length === 0) return;
    setSavingId(venue.id);
    setError(null);
    setActionMsg(null);
    try {
      await mutate("/api/admin/venues", {
        method: "PATCH",
        body: JSON.stringify({ id: venue.id, fields: changed }),
      });
      setActionMsg(`Saved ${Object.keys(changed).length} change${Object.keys(changed).length === 1 ? "" : "s"} to ${venue.name}.`);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.code || "Could not save those changes."
          : "Network error. Please try again.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const filtered = venues.filter((v) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      (v.contact_name || "").toLowerCase().includes(q) ||
      (v.email || "").toLowerCase().includes(q) ||
      (v.location || "").toLowerCase().includes(q) ||
      (v.city || "").toLowerCase().includes(q) ||
      (v.postcode || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <h1 className="text-2xl lg:text-3xl">Registered Venues</h1>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, contact, email, postcode…"
          className="w-full sm:w-80 px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {actionMsg && (
        <p className="text-sm text-foreground bg-accent/5 border border-accent/20 px-3 py-2 rounded-sm mb-4">
          {actionMsg}
        </p>
      )}

      {loading ? (
        <p className="text-muted text-sm py-8 text-center">Loading venues...</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">
          {search ? `No venues match "${search}".` : "No registered venues yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((venue) => {
            const expanded = expandedId === venue.id;
            const arrangements = [
              venue.interested_in_free_loan && ARRANGEMENT_LABEL.paid_loan,
              venue.interested_in_revenue_share && ARRANGEMENT_LABEL.revenue_share,
              venue.interested_in_direct_purchase && ARRANGEMENT_LABEL.purchase,
            ].filter(Boolean) as string[];
            return (
              <div key={venue.id} className="bg-white border border-border rounded-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : venue.id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-surface/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-foreground truncate">{venue.name}</p>
                      {venue.placement_count != null && venue.placement_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent rounded-sm border border-accent/20">
                          {venue.placement_count} placement{venue.placement_count === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {[venue.type, venue.city || venue.location, venue.contact_name].filter(Boolean).join(" · ") || "-"}
                    </p>
                  </div>
                  <p className="text-xs text-muted shrink-0 hidden sm:block">
                    {new Date(venue.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                  >
                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {expanded && editingId === venue.id && (
                  <VenueEditor
                    venue={venue}
                    disabled={savingId === venue.id}
                    onCancel={() => setEditingId(null)}
                    onSave={(changed) => saveVenue(venue, changed)}
                  />
                )}

                {expanded && editingId !== venue.id && (
                  <div className="px-5 pb-5 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 text-sm">
                    <div className="space-y-3">
                      <Section label="Contact">
                        <KV label="Name" value={venue.contact_name} />
                        <KV label="Email" value={venue.email} mailto />
                        <KV label="Phone" value={venue.phone} />
                      </Section>
                      <Section label="Address">
                        <KV label="Line 1" value={venue.address_line1} />
                        {venue.address_line2 && <KV label="Line 2" value={venue.address_line2} />}
                        <KV label="City" value={venue.city || venue.location} />
                        <KV label="Postcode" value={venue.postcode} />
                      </Section>
                      <Section label="Preferences">
                        <KV label="Arrangements" value={arrangements.length ? arrangements.join(", ") : "-"} />
                        <KV label="Footfall" value={venue.approximate_footfall} />
                        <KV label="Audience" value={venue.audience_type} />
                        <KV label="Wall Space (signup)" value={venue.wall_space} />
                        {(venue.preferred_styles || []).length > 0 && (
                          <KV label="Styles" value={(venue.preferred_styles || []).join(", ")} />
                        )}
                        {(venue.preferred_themes || []).length > 0 && (
                          <KV label="Themes" value={(venue.preferred_themes || []).join(", ")} />
                        )}
                      </Section>
                    </div>
                    <div className="space-y-3">
                      <Section label="Display Needs">
                        <KV label="Wall Space" value={venue.display_wall_space} />
                        <KV label="Lighting" value={venue.display_lighting} />
                        <KV label="Install Notes" value={venue.display_install_notes} />
                        <KV label="Rotation" value={venue.display_rotation_frequency} />
                      </Section>
                      {venue.description && (
                        <Section label="Description">
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{venue.description}</p>
                        </Section>
                      )}
                      <Section label="Activity">
                        <KV label="Placements" value={String(venue.placement_count ?? 0)} />
                        <KV label="Joined" value={new Date(venue.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
                        <p className="text-xs text-muted mt-2">
                          <a href={`/spaces#venue-${venue.slug}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            View public profile →
                          </a>
                        </p>
                      </Section>
                      <button
                        type="button"
                        onClick={() => setEditingId(venue.id)}
                        className="px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface rounded-sm transition-colors"
                      >
                        Edit details
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted mt-4">{filtered.length} venue{filtered.length !== 1 ? "s" : ""} {search ? "matched" : "registered"}</p>
    </>
  );
}

// G9. Diffs against the loaded row on save and sends only what moved, so a
// concurrent edit elsewhere is not silently overwritten by whatever this form
// happened to be holding.
function VenueEditor({
  venue,
  disabled,
  onCancel,
  onSave,
}: {
  venue: VenueRow;
  disabled: boolean;
  onCancel: () => void;
  onSave: (changed: Partial<Record<EditableKey, string>>) => void;
}) {
  const initial = Object.fromEntries(
    EDITABLE.map((f) => [f.key, (venue[f.key] as string | undefined) ?? ""]),
  ) as Record<EditableKey, string>;
  const [values, setValues] = useState<Record<EditableKey, string>>(initial);

  function submit() {
    const changed: Partial<Record<EditableKey, string>> = {};
    for (const f of EDITABLE) {
      if (values[f.key] !== initial[f.key]) changed[f.key] = values[f.key];
    }
    onSave(changed);
  }

  return (
    <div className="px-5 pb-5 border-t border-border pt-4">
      <p className="text-[11px] text-muted uppercase tracking-wider mb-3">Edit record</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EDITABLE.map((f) => (
          <div key={f.key} className={f.multiline ? "sm:col-span-2" : undefined}>
            <label
              htmlFor={`venue-${venue.id}-${f.key}`}
              className="block text-[11px] text-muted mb-1"
            >
              {f.label}
            </label>
            {f.multiline ? (
              <textarea
                id={`venue-${venue.id}-${f.key}`}
                rows={3}
                value={values[f.key]}
                disabled={disabled}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 disabled:opacity-60"
              />
            ) : (
              <input
                id={`venue-${venue.id}-${f.key}`}
                type="text"
                value={values[f.key]}
                disabled={disabled}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 disabled:opacity-60"
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          disabled={disabled}
          onClick={submit}
          className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors disabled:opacity-60"
        >
          Save changes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-foreground border border-border hover:bg-surface rounded-sm transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-1.5">{label}</p>
      <div className="bg-surface/40 border border-border rounded-sm px-3 py-2 space-y-1">{children}</div>
    </div>
  );
}

function KV({ label, value, mailto }: { label: string; value?: string | null; mailto?: boolean }) {
  if (!value) return null;
  return (
    <p className="text-xs">
      <span className="text-muted mr-1.5">{label}:</span>
      {mailto ? (
        <a href={`mailto:${value}`} className="text-accent hover:underline break-all">{value}</a>
      ) : (
        <span className="text-foreground">{value}</span>
      )}
    </p>
  );
}
