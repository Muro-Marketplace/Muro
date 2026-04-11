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
  contact_name: string;
  created_at: string;
}

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <AdminPortalLayout activePath="/admin/venues">
      <h1 className="text-2xl lg:text-3xl mb-6">Registered Venues</h1>

      {loading ? (
        <p className="text-muted text-sm py-8 text-center">Loading venues...</p>
      ) : venues.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">No registered venues yet.</p>
      ) : (
        <div className="bg-white border border-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Venue</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden sm:table-cell">Type</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden lg:table-cell">Contact</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden lg:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((venue) => (
                <tr key={venue.id} className="border-b border-border last:border-b-0 hover:bg-surface/30">
                  <td className="py-3 px-4 font-medium text-foreground">{venue.name}</td>
                  <td className="py-3 px-4 text-muted hidden sm:table-cell">{venue.type || "—"}</td>
                  <td className="py-3 px-4 text-muted hidden md:table-cell">{venue.location || "—"}</td>
                  <td className="py-3 px-4 text-muted hidden lg:table-cell">{venue.contact_name || "—"}</td>
                  <td className="py-3 px-4 text-muted hidden lg:table-cell">
                    {new Date(venue.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted mt-4">{venues.length} venue{venues.length !== 1 ? "s" : ""} registered</p>
    </AdminPortalLayout>
  );
}
