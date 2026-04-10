import { supabase } from "@/lib/supabase";
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
  const row = { ...work, artist_id: artistProfileId };

  const { data: existing } = await supabase
    .from("artist_works")
    .select("id")
    .eq("id", work.id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("artist_works")
      .update(row)
      .eq("id", work.id);
    return { error };
  } else {
    const { error } = await supabase
      .from("artist_works")
      .insert(row);
    return { error };
  }
}

export async function deleteWork(workId: string, artistProfileId: string) {
  const { error } = await supabase
    .from("artist_works")
    .delete()
    .eq("id", workId)
    .eq("artist_id", artistProfileId);

  return { error };
}
