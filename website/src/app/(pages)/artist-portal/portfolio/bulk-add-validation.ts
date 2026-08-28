/**
 * Bulk-add draft validation (D24), extracted from page.tsx the same way as
 * bulk-pricing.ts and changed-works.ts so the rules that decide which drafts
 * save and which stay in the editor are unit-testable.
 *
 * The old flow filtered to the valid drafts and, if any existed, saved those
 * and cleared the whole list, silently discarding every incomplete draft
 * (typed titles, uploaded images and all). These helpers give each held-back
 * draft a message the card can show, so only saved drafts leave the form.
 */

/** The subset of BulkAddDraft the validation rules read. */
export interface BulkAddDraftFields {
  draftId: string;
  uploading: boolean;
  imageUrl: string;
  title: string;
  sizes: { label: string; price: number }[];
}

/**
 * Why a draft cannot be saved yet, or null when it can. Mirrors the
 * save-time filter exactly: uploading, image, title, then at least one
 * priced size.
 */
export function bulkAddDraftError(d: BulkAddDraftFields): string | null {
  if (d.uploading) {
    return "The image is still uploading. Wait for it to finish, then save again.";
  }
  const missing: string[] = [];
  if (!d.imageUrl) missing.push("an image");
  if (!d.title.trim()) missing.push("a title");
  if (!d.sizes.some((s) => s.label && s.price > 0)) {
    missing.push("at least one size with a price above £0");
  }
  if (missing.length === 0) return null;
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `This draft needs ${list} before it can be saved.`;
}

/**
 * Split drafts into the saveable ones and a per-draft error map (keyed by
 * draftId) for the rest. Order is preserved in `valid`.
 */
export function partitionBulkAddDrafts<T extends BulkAddDraftFields>(
  drafts: T[],
): { valid: T[]; errors: Map<string, string> } {
  const errors = new Map<string, string>();
  for (const d of drafts) {
    const err = bulkAddDraftError(d);
    if (err) errors.set(d.draftId, err);
  }
  return { valid: drafts.filter((d) => !errors.has(d.draftId)), errors };
}
