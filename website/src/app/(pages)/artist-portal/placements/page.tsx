"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import ArtistPortalLayout from "@/components/ArtistPortalLayout";
import { useCurrentArtist } from "@/hooks/useCurrentArtist";
import { authFetch } from "@/lib/api-client";

type FilterTab = "All" | "Active" | "Pending" | "Completed";
type ArrangementType = "Free Loan" | "Revenue Share" | "Direct Purchase";
type PlacementStatus = "Active" | "Pending" | "Completed" | "Sold";

interface Placement {
  id: string;
  workTitle: string;
  workImage: string;
  venue: string;
  type: ArrangementType;
  revenueSharePercent?: number;
  status: PlacementStatus;
  date: string;
  revenue: string | null;
  notes?: string;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700";
    case "Pending": return "bg-amber-100 text-amber-700";
    case "Sold": return "bg-blue-100 text-blue-700";
    case "Completed": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-600";
  }
};

const tabs: FilterTab[] = ["All", "Active", "Pending", "Completed"];

export default function PlacementsPage() {
  const { artist, loading: artistLoading } = useCurrentArtist();
  const [activeTab, setActiveTab] = useState<FilterTab>("All");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [initialised, setInitialised] = useState(false);

  // Form state
  const [venueName, setVenueName] = useState("");
  const [arrangementType, setArrangementType] = useState<ArrangementType>("Free Loan");
  const [revenuePercent, setRevenuePercent] = useState(10);
  const [selectedWorks, setSelectedWorks] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<PlacementStatus>("Active");

  // Load placements from API
  useEffect(() => {
    if (!artist || initialised) return;
    authFetch("/api/placements")
      .then((res) => res.json())
      .then((data) => {
        if (data.placements && data.placements.length > 0) {
          const mapped: Placement[] = data.placements.map((p: Record<string, unknown>) => ({
            id: p.id,
            workTitle: p.work_title || "Untitled",
            workImage: (p.work_image as string) || "",
            venue: p.venue || "",
            type: (p.arrangement_type || "Free Loan") as ArrangementType,
            revenueSharePercent: p.revenue_share_percent as number | undefined,
            status: (p.status || "active") as PlacementStatus,
            date: p.created_at ? new Date(p.created_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
            revenue: p.revenue ? `\u00a3${p.revenue}` : null,
            notes: p.notes as string | undefined,
          }));
          setPlacements(mapped);
        }
      })
      .catch(() => { /* empty state */ })
      .finally(() => setInitialised(true));
  }, [artist, initialised]);

  function toggleWork(index: number) {
    setSelectedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleSubmit() {
    if (!venueName || selectedWorks.size === 0) return;

    const newPlacements: Placement[] = Array.from(selectedWorks).map((workIndex) => {
      const work = works[workIndex];
      return {
        id: `p-${Date.now()}-${workIndex}`,
        workTitle: work.title,
        workImage: work.image,
        venue: venueName,
        type: arrangementType,
        revenueSharePercent: arrangementType === "Revenue Share" ? revenuePercent : undefined,
        status,
        date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        revenue: null,
        notes: notes || undefined,
      };
    });

    // Save to Supabase
    try {
      await authFetch("/api/placements", {
        method: "POST",
        body: JSON.stringify({
          placements: newPlacements.map((p) => ({
            ...p,
            workTitle: p.workTitle,
            workImage: p.workImage,
          })),
        }),
      });
    } catch (err) {
      console.error("Placement save error:", err);
    }

    setPlacements([...newPlacements, ...placements]);
    setShowForm(false);
    setVenueName("");
    setSelectedWorks(new Set());
    setNotes("");
    setArrangementType("Free Loan");
    setStatus("Active");
  }

  function updateStatus(id: string, newStatus: PlacementStatus) {
    setPlacements(placements.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    authFetch("/api/placements", {
      method: "PATCH",
      body: JSON.stringify({ id, status: newStatus }),
    }).catch((err) => console.error("Status update error:", err));
  }

  function removePlacement(id: string) {
    setPlacements(placements.filter((p) => p.id !== id));
    authFetch(`/api/placements?id=${id}`, { method: "DELETE" })
      .catch((err) => console.error("Placement delete error:", err));
  }

  const filtered = placements.filter((p) => {
    if (activeTab === "All") return true;
    if (activeTab === "Completed") return p.status === "Completed" || p.status === "Sold";
    return p.status === activeTab;
  });

  const inputClass = "w-full bg-background border border-border rounded-sm px-4 py-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:border-accent/60 transition-colors";

  if (artistLoading || !artist) {
    return (
      <ArtistPortalLayout activePath="/artist-portal/placements">
        <p className="text-muted text-sm py-12 text-center">{artistLoading ? "Loading..." : "No artist profile found. Complete your profile setup first."}</p>
      </ArtistPortalLayout>
    );
  }

  const works = artist.works;

  return (
    <ArtistPortalLayout activePath="/artist-portal/placements">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl lg:text-3xl">Placements</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            {placements.filter((p) => p.status === "Active").length} active
          </span>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-sm transition-colors"
          >
            + Log Placement
          </button>
        </div>
      </div>

      {/* Log Placement Form */}
      {showForm && (
        <div className="bg-surface border border-border rounded-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-medium">Log New Placement</h2>
            <button onClick={() => setShowForm(false)} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
          </div>

          <div className="space-y-5">
            {/* Venue name */}
            <div>
              <label className="block text-sm font-medium mb-2">Venue Name <span className="text-accent">*</span></label>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="e.g. Ozone Coffee, Shoreditch"
                className={inputClass}
              />
            </div>

            {/* Arrangement type */}
            <div>
              <label className="block text-sm font-medium mb-2">Arrangement Type</label>
              <div className="flex gap-2">
                {(["Free Loan", "Revenue Share", "Direct Purchase"] as ArrangementType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setArrangementType(type)}
                    className={`px-4 py-2 text-xs rounded-sm border transition-colors ${
                      arrangementType === type
                        ? "bg-foreground text-white border-foreground"
                        : "border-border text-muted hover:border-foreground/30"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Revenue share % */}
            {arrangementType === "Revenue Share" && (
              <div>
                <label className="block text-sm font-medium mb-2">Venue Revenue Share %</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={revenuePercent}
                    onChange={(e) => setRevenuePercent(Number(e.target.value) || 0)}
                    className="w-20 bg-background border border-border rounded-sm px-3 py-3 text-sm text-center focus:outline-none focus:border-accent/60"
                  />
                  <span className="text-sm text-muted">% to the venue on sales from their space</span>
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <div className="flex gap-2">
                {(["Active", "Pending"] as PlacementStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`px-4 py-2 text-xs rounded-sm border transition-colors ${
                      status === s
                        ? "bg-foreground text-white border-foreground"
                        : "border-border text-muted hover:border-foreground/30"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted mt-1">Active = already on the wall. Pending = agreed but not yet installed.</p>
            </div>

            {/* Select works */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Works to Place <span className="text-accent">*</span>
                {selectedWorks.size > 0 && (
                  <span className="text-accent ml-2 font-normal">{selectedWorks.size} selected</span>
                )}
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {works.map((work, i) => {
                  const selected = selectedWorks.has(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleWork(i)}
                      className={`relative aspect-square rounded-sm overflow-hidden border-2 transition-all ${
                        selected ? "border-accent shadow-sm" : "border-transparent hover:border-border"
                      }`}
                    >
                      <Image src={work.image} alt={work.title} fill className="object-cover" sizes="80px" />
                      {selected && (
                        <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="2 7 5.5 10.5 12 3.5" /></svg>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-2">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any details about the arrangement, delivery date, contact person..."
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={!venueName || selectedWorks.size === 0}
                className="px-6 py-2.5 text-sm font-medium text-white bg-foreground hover:bg-foreground/90 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Log {selectedWorks.size} Placement{selectedWorks.size !== 1 ? "s" : ""}
              </button>
              <button onClick={() => setShowForm(false)} className="px-6 py-2.5 text-sm text-muted border border-border rounded-sm hover:text-foreground transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => {
          const count =
            tab === "All"
              ? placements.length
              : tab === "Completed"
              ? placements.filter((p) => p.status === "Completed" || p.status === "Sold").length
              : placements.filter((p) => p.status === tab).length;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab}
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab ? "bg-accent/10 text-accent" : "bg-border text-muted"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table - desktop */}
      <div className="bg-surface border border-border rounded-sm hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background">
                <th className="text-left text-xs text-muted font-medium px-6 py-3">Piece</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Venue</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Type</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Status</th>
                <th className="text-left text-xs text-muted font-medium px-4 py-3">Date</th>
                <th className="text-right text-xs text-muted font-medium px-4 py-3">Revenue</th>
                <th className="text-right text-xs text-muted font-medium px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-background/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                        <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="32px" />
                      </div>
                      <span className="font-medium text-foreground">{p.workTitle}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.venue}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs border border-border rounded-sm px-2 py-0.5 text-muted">
                      {p.type}{p.revenueSharePercent ? ` (${p.revenueSharePercent}%)` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      value={p.status}
                      onChange={(e) => updateStatus(p.id, e.target.value as PlacementStatus)}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border-none cursor-pointer ${statusBadge(p.status)}`}
                    >
                      <option value="Active">Active</option>
                      <option value="Pending">Pending</option>
                      <option value="Completed">Completed</option>
                      <option value="Sold">Sold</option>
                    </select>
                  </td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{p.date}</td>
                  <td className="px-4 py-3.5 text-right font-medium text-foreground">
                    {p.revenue ?? <span className="text-muted">-</span>}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      onClick={() => { if (confirm("Remove this placement?")) removePlacement(p.id); }}
                      className="text-xs text-muted hover:text-red-500 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center text-muted text-sm">No placements found.</div>
        )}
      </div>

      {/* Cards - mobile */}
      <div className="sm:hidden space-y-3">
        {filtered.map((p) => (
          <div key={p.id} className="bg-surface border border-border rounded-sm p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 relative rounded-sm overflow-hidden bg-border/20 shrink-0">
                  <Image src={p.workImage} alt={p.workTitle} fill className="object-cover" sizes="40px" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm leading-snug">{p.workTitle}</p>
                  <p className="text-xs text-muted">{p.venue}</p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${statusBadge(p.status)}`}>
                {p.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted mt-2">
              <div className="flex items-center gap-2">
                <span className="border border-border rounded-sm px-1.5 py-0.5">
                  {p.type}{p.revenueSharePercent ? ` ${p.revenueSharePercent}%` : ""}
                </span>
                <span>{p.date}</span>
              </div>
              {p.revenue && <span className="font-medium text-foreground">{p.revenue}</span>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-muted text-sm py-8">No placements found.</p>
        )}
      </div>
    </ArtistPortalLayout>
  );
}
