/**
 * /browse/[slug]/showroom: the artist's public showroom, entered from the
 * browse card's View showroom or the profile's Enter showroom. Walls come
 * from the artist's Showroom in their portal, each with the picture they
 * saved from Preview, so what a visitor moves around in is the wall exactly
 * as the artist laid it out.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getArtistBySlug } from "@/lib/db/merged-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getPublicShowroomWalls } from "@/lib/artists/showroom";
import ShowroomViewer from "@/components/ShowroomViewer";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ wall?: string | string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) return { title: "Showroom | Wallplace" };
  return { title: `${artist.name} showroom | Wallplace` };
}

async function loadWalls(slug: string) {
  try {
    const { data } = await getSupabaseAdmin()
      .from("artist_profiles")
      .select("user_id")
      .eq("slug", slug)
      .maybeSingle<{ user_id: string | null }>();
    return await getPublicShowroomWalls(data?.user_id ?? null);
  } catch {
    return [];
  }
}

export default async function ArtistShowroomPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();
  const query = await searchParams;
  const requested = typeof query.wall === "string" ? query.wall : null;
  const walls = await loadWalls(artist.slug);
  return (
    <div className="bg-background min-h-[60vh]">
      <ShowroomViewer artistName={artist.name} artistSlug={artist.slug} walls={walls} initialWallId={requested} />
    </div>
  );
}
