import { supabase } from "@/lib/supabase";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { DbArtistWork } from "./artist-profiles";

export async function getWorksByArtistProfileId(artistProfileId: string): Promise<DbArtistWork[]> {
  const { data } = await supabase
    .from("artist_works")
    .select("*")
    .eq("artist_id", artistProfileId)
    .order("sort_order", { ascending: true });

  return (data || []) as DbArtistWork[];
}

export async function upsertWork(
  artistProfileId: string,
  work: Omit<DbArtistWork, "artist_id">
) {
  const db = getSupabaseAdmin();
  const row = { ...work, artist_id: artistProfileId };

  const { data: existing } = await db
    .from("artist_works")
    .select("id")
    .eq("id", work.id)
    .single();

  if (existing) {
    const { error } = await db
      .from("artist_works")
      .update(row)
      .eq("id", work.id);
    return { error };
  } else {
    const { error } = await db
      .from("artist_works")
      .insert(row);
    return { error };
  }
}

export async function deleteWork(workId: string, artistProfileId: string) {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("artist_works")
    .delete()
    .eq("id", workId)
    .eq("artist_id", artistProfileId);

  return { error };
}
