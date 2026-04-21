import type { MetadataRoute } from "next";
import { artists } from "@/data/artists";
import { slugify } from "@/lib/slugify";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://wallplace.co.uk").replace(/\/$/, "");

const STATIC_ROUTES: string[] = [
  "/",
  "/browse",
  "/artists",
  "/galleries",
  "/venues",
  "/spaces-looking-for-art",
  "/curated",
  "/how-it-works",
  "/about",
  "/contact",
  "/faqs",
  "/pricing",
  "/blog",
  "/apply",
  "/signup",
  "/login",
  "/waitlist",
  "/register-venue",
  "/terms",
  "/privacy",
  "/cookies",
  "/returns",
  "/complaints",
  "/ip-policy",
  "/artist-agreement",
  "/venue-agreement",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));

  // Seed artist + artwork pages from static data
  const seedEntries: MetadataRoute.Sitemap = [];
  for (const artist of artists) {
    seedEntries.push({
      url: `${SITE_URL}/browse/${artist.slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    });
    for (const work of artist.works) {
      seedEntries.push({
        url: `${SITE_URL}/browse/${artist.slug}/${slugify(work.title)}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }

  // Database artists (best-effort; skip if env/DB isn't available at build time)
  let dbEntries: MetadataRoute.Sitemap = [];
  try {
    const db = getSupabaseAdmin();
    const { data: dbArtists } = await db
      .from("artist_profiles")
      .select("slug, updated_at");
    const { data: dbWorks } = await db
      .from("artist_works")
      .select("title, updated_at, artist_profiles!inner(slug)");

    for (const row of (dbArtists || [])) {
      const lastMod = row.updated_at ? new Date(row.updated_at) : now;
      dbEntries.push({
        url: `${SITE_URL}/browse/${row.slug}`,
        lastModified: lastMod,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    for (const row of (dbWorks || []) as Array<{ title: string; updated_at?: string; artist_profiles: { slug: string } | { slug: string }[] }>) {
      const slug = Array.isArray(row.artist_profiles) ? row.artist_profiles[0]?.slug : row.artist_profiles?.slug;
      if (!slug || !row.title) continue;
      dbEntries.push({
        url: `${SITE_URL}/browse/${slug}/${slugify(row.title)}`,
        lastModified: row.updated_at ? new Date(row.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    dbEntries = [];
  }

  // Deduplicate by URL, preferring DB entries (more recent lastModified)
  const byUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of [...base, ...seedEntries, ...dbEntries]) {
    byUrl.set(entry.url, entry);
  }
  return Array.from(byUrl.values());
}
