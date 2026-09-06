// E41-c. The portfolio save used to POST every work on every change, so editing one
// work in a 20-work portfolio fired 20 concurrent SELECT+UPDATE+read-back writes and
// raced the per-tier post-limit check (artist-works/route.ts). This diff returns only
// the works that actually need re-POSTing: new works, works whose POSTed fields
// changed, and works whose position (sortOrder) changed. Extracted so it can be
// unit-tested without rendering the editor.

import type { ArtistWork } from "@/data/artists";

export interface WorkToPost {
  work: ArtistWork;
  /** New position in the array, sent as sortOrder. */
  index: number;
}

type WorkExtras = ArtistWork & {
  shippingPrice?: number | null;
  inStorePrice?: number | null;
  quantityAvailable?: number | null;
  frameOptions?: unknown;
};

/**
 * A canonical string of the fields the POST body carries (everything except `id`,
 * which is the match key, and `sortOrder`, which is handled by the index compare).
 * Two works with the same key would POST identical bodies, so one is redundant.
 */
function postKey(work: ArtistWork): string {
  const w = work as WorkExtras;
  return JSON.stringify({
    title: work.title,
    medium: work.medium,
    dimensions: work.dimensions,
    priceBand: work.priceBand,
    pricing: work.pricing,
    available: work.available,
    color: work.color ?? null,
    image: work.image,
    orientation: work.orientation ?? null,
    shippingPrice: w.shippingPrice ?? null,
    inStorePrice: w.inStorePrice ?? null,
    quantityAvailable: w.quantityAvailable ?? null,
    frameOptions: w.frameOptions ?? [],
    description: work.description ?? "",
    images: work.images ?? [],
  });
}

/**
 * The works in `updated` that differ from the last-persisted `persisted` snapshot,
 * each with its new index. A work is included when it is new (no persisted match by
 * id), has moved (its index changed), or any POSTed field changed. Unchanged works
 * in the same position are skipped, so a one-work edit POSTs one work.
 */
export function worksToPost(updated: ArtistWork[], persisted: ArtistWork[]): WorkToPost[] {
  const prevById = new Map(persisted.map((w, i) => [w.id, { work: w, index: i }]));
  const out: WorkToPost[] = [];
  updated.forEach((work, index) => {
    const prev = prevById.get(work.id);
    if (!prev || prev.index !== index || postKey(prev.work) !== postKey(work)) {
      out.push({ work, index });
    }
  });
  return out;
}
