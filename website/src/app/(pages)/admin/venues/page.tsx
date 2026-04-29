"use client";

import { useState, useEffect } from "react";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

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

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/admin/venues");
        if (res.ok) {
          const data = await res.json();
          setVenues(data.venues || []);
        }
      } catch (err) {
        console.error("Failed to load venues:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

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
    <AdminPortalLayout activePath="/admin/venues">
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
              venue.interested_in_free_loan && "Paid Loan",
              venue.interested_in_revenue_share && "Revenue Share",
              venue.interested_in_direct_purchase && "Purchase",
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
                      {[venue.type, venue.city || venue.location, venue.contact_name].filter(Boolean).join(" · ") || "–"}
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

                {expanded && (
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
                        <KV label="Arrangements" value={arrangements.length ? arrangements.join(", ") : "–"} />
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
                          <a href={`/spaces-looking-for-art#venue-${venue.slug}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            View public profile →
                          </a>
                        </p>
                      </Section>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted mt-4">{filtered.length} venue{filtered.length !== 1 ? "s" : ""} {search ? "matched" : "registered"}</p>
    </AdminPortalLayout>
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
