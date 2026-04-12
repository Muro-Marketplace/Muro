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
    let { error } = await db
      .from("artist_works")
      .update(row)
      .eq("id", work.id);
    // Retry without shipping_price if column doesn't exist yet
    if (error) {
      const { shipping_price: _, ...rowWithout } = row;
      const retry = await db.from("artist_works").update(rowWithout).eq("id", work.id);
      error = retry.error;
    }
    return { error };
  } else {
    let { error } = await db
      .from("artist_works")
      .insert(row);
    // Retry without shipping_price if column doesn't exist yet
    if (error) {
      const { shipping_price: _, ...rowWithout } = row;
      const retry = await db.from("artist_works").insert(rowWithout);
      error = retry.error;
    }
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
