"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import AdminPortalLayout from "@/components/AdminPortalLayout";
import { authFetch } from "@/lib/api-client";

interface ArtistRow {
  id: string;
  user_id: string;
  slug: string;
  name: string;
  primary_medium: string;
  location: string;
  created_at: string;
}

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await authFetch("/api/admin/artists");
        if (res.ok) {
          const data = await res.json();
          setArtists(data.artists || []);
        }
      } catch (err) {
        console.error("Failed to load artists:", err);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AdminPortalLayout activePath="/admin/artists">
      <h1 className="text-2xl lg:text-3xl mb-6">Registered Artists</h1>

      {loading ? (
        <p className="text-muted text-sm py-8 text-center">Loading artists...</p>
      ) : artists.length === 0 ? (
        <p className="text-muted text-sm py-8 text-center">No registered artists yet.</p>
      ) : (
        <div className="bg-white border border-border rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/50">
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Name</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden sm:table-cell">Medium</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden md:table-cell">Location</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider hidden lg:table-cell">Joined</th>
                <th className="text-left py-3 px-4 font-medium text-muted text-xs uppercase tracking-wider">Profile</th>
              </tr>
            </thead>
            <tbody>
              {artists.map((artist) => (
                <tr key={artist.id} className="border-b border-border last:border-b-0 hover:bg-surface/30">
                  <td className="py-3 px-4 font-medium text-foreground">{artist.name}</td>
                  <td className="py-3 px-4 text-muted hidden sm:table-cell">{artist.primary_medium || "—"}</td>
                  <td className="py-3 px-4 text-muted hidden md:table-cell">{artist.location || "—"}</td>
                  <td className="py-3 px-4 text-muted hidden lg:table-cell">
                    {new Date(artist.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="py-3 px-4">
                    <Link href={`/browse/${artist.slug}`} className="text-accent hover:underline text-xs">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted mt-4">{artists.length} artist{artists.length !== 1 ? "s" : ""} registered</p>
    </AdminPortalLayout>
  );
}
