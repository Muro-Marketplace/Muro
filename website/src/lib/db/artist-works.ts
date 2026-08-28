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

  // E32. This client is the service-role client, so it bypasses RLS entirely and
  // ownership has to be enforced here. Matching on `id` alone let any artist
  // update any other artist's row, and because `row` carries the caller's
  // artist_id the update ALSO transferred ownership: steal the listing, then
  // point the payout at your own Connect account. The predicate goes in the same
  // query as the fetch, so a non-owner sees zero rows rather than someone else's.
  // deleteWork below has always been scoped this way.
  const { data: existing } = await db
    .from("artist_works")
    .select("id")
    .eq("id", work.id)
    .eq("artist_id", artistProfileId)
    .maybeSingle();

  if (!existing) {
    // Not ours. Either the id is free, which is a genuine new work, or it belongs
    // to somebody else, in which case refuse rather than falling through to an
    // insert that would surface as an opaque primary-key conflict.
    const { data: takenByAnother } = await db
      .from("artist_works")
      .select("id")
      .eq("id", work.id)
      .maybeSingle();
    if (takenByAnother) {
      return {
        error: {
          message: "That artwork isn't in your portfolio.",
          code: "work_not_owned",
          details: "",
          hint: "",
          name: "WorkNotOwnedError",
        },
        droppedColumns: [],
        savedRow: null,
        fallbackErrors: [],
      };
    }
  }

  /** Every update is scoped by artist_id, not just the first one. */
  function scopedUpdate(r: Record<string, unknown>) {
    return db
      .from("artist_works")
      .update(r)
      .eq("id", work.id)
      .eq("artist_id", artistProfileId);
  }

  async function attempt(r: Record<string, unknown>) {
    if (existing) {
      return scopedUpdate(r);
    }
    return db.from("artist_works").insert(r);
  }

  const droppedColumns: string[] = [];
  const fallbackErrors: string[] = [];

  // Split into "core" (always-present columns we need to succeed) and
  // "extended" (newer columns from migrations 009/010/015). We attempt
  // the full write first; if it fails we drop extended columns one group
  // at a time and try again. After the core write succeeds we then apply
  // the extended columns INDIVIDUALLY so a failure on (say) in_store_price
  // doesn't silently kill the description save.
  const extendedColumns = [
    "description",
    "images",
    "frame_options",
    "shipping_price",
    "in_store_price",
    "quantity_available",
  ] as const;

  const coreRow: Record<string, unknown> = { ...row };
  const extendedRow: Record<string, unknown> = {};
  for (const col of extendedColumns) {
    if (Object.prototype.hasOwnProperty.call(coreRow, col)) {
      extendedRow[col] = coreRow[col];
      delete coreRow[col];
    }
  }

  // First try the full write for max efficiency.
  let { error } = await attempt(row);

  // If the full write failed, fall back to core-only + per-column updates.
  if (error) {
    fallbackErrors.push(`full-write: ${error.message}`);
    ({ error } = await attempt(coreRow));
    if (error) {
      // Core write failed, give up.
      return { error, droppedColumns: [...extendedColumns], savedRow: null, fallbackErrors };
    }
    // Core succeeded. Now apply each extended column individually so a
    // per-column error doesn't block the others.
    for (const col of extendedColumns) {
      if (!Object.prototype.hasOwnProperty.call(extendedRow, col)) continue;
      const { error: perColErr } = await scopedUpdate({ [col]: extendedRow[col] });
      if (perColErr) {
        droppedColumns.push(col);
        fallbackErrors.push(`${col}: ${perColErr.message}`);
      }
    }
  }

  if (fallbackErrors.length > 0) {
    console.warn("upsertWork fallback chain:", fallbackErrors);
  }

  // Read back so the API can confirm what actually persisted.
  let savedRow: DbArtistWork | null = null;
  if (!error) {
    const { data } = await db
      .from("artist_works")
      .select("*")
      .eq("id", work.id)
      .eq("artist_id", artistProfileId)
      .single();
    savedRow = (data as DbArtistWork | null) ?? null;

    // Belt-and-braces: if the description was sent but didn't persist
    // (e.g. PostgREST schema cache was stale during the full-write,
    // but the core+per-col path was skipped because the full-write
    // appeared to succeed), do one targeted update.
    if (typeof row.description === "string" && row.description.length > 0 && savedRow && !savedRow.description) {
      const { error: fixErr } = await scopedUpdate({ description: row.description });
      if (fixErr) {
        fallbackErrors.push(`description-repair: ${fixErr.message}`);
      } else {
        const { data: refetched } = await db
          .from("artist_works")
          .select("*")
          .eq("id", work.id)
          .eq("artist_id", artistProfileId)
          .single();
        savedRow = (refetched as DbArtistWork | null) ?? savedRow;
      }
    }
  }

  return { error, droppedColumns, savedRow, fallbackErrors };
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
