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

  async function attempt(r: Record<string, unknown>) {
    if (existing) {
      return db.from("artist_works").update(r).eq("id", work.id);
    }
    return db.from("artist_works").insert(r);
  }

  // Try full write; on failure, progressively strip newer optional columns.
  const droppedColumns: string[] = [];
  let { error } = await attempt(row);
  if (error) {
    const { description: _d, images: _i, ...r2 } = row as Record<string, unknown>;
    void _d; void _i;
    droppedColumns.push("description", "images");
    ({ error } = await attempt(r2));
  }
  if (error) {
    const { description: _d, images: _i, shipping_price: _sp, quantity_available: _qa, frame_options: _fo, ...r3 } = row as Record<string, unknown>;
    void _d; void _i; void _sp; void _qa; void _fo;
    droppedColumns.push("shipping_price", "quantity_available", "frame_options");
    ({ error } = await attempt(r3));
  }
  return { error, droppedColumns };
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
