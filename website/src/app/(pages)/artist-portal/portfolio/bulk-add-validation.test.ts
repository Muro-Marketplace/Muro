// D24: bulk add used to filter to the valid drafts and clear the whole list,
// silently discarding every incomplete draft whenever at least one was valid.
// These rules now decide which drafts save and which stay in the editor with
// a message, so they are pinned here.

import { describe, it, expect } from "vitest";
import {
  bulkAddDraftError,
  partitionBulkAddDrafts,
  type BulkAddDraftFields,
} from "./bulk-add-validation";

function draft(overrides: Partial<BulkAddDraftFields> = {}): BulkAddDraftFields {
  return {
    draftId: "d1",
    uploading: false,
    imageUrl: "https://cdn/a.png",
    title: "Sunset",
    sizes: [{ label: '10×8" (25×20 cm)', price: 120 }],
    ...overrides,
  };
}

describe("bulkAddDraftError", () => {
  it("returns null for a complete draft", () => {
    expect(bulkAddDraftError(draft())).toBeNull();
  });

  it("flags a draft whose image is still uploading", () => {
    expect(bulkAddDraftError(draft({ uploading: true }))).toBe(
      "The image is still uploading. Wait for it to finish, then save again.",
    );
  });

  it("flags a missing image", () => {
    expect(bulkAddDraftError(draft({ imageUrl: "" }))).toBe(
      "This draft needs an image before it can be saved.",
    );
  });

  it("flags a missing title, including whitespace-only", () => {
    expect(bulkAddDraftError(draft({ title: "   " }))).toBe(
      "This draft needs a title before it can be saved.",
    );
  });

  it("flags a draft with no priced size", () => {
    expect(
      bulkAddDraftError(draft({ sizes: [{ label: "A3", price: 0 }] })),
    ).toBe(
      "This draft needs at least one size with a price above £0 before it can be saved.",
    );
  });

  it("a priced size with no label does not count", () => {
    expect(
      bulkAddDraftError(draft({ sizes: [{ label: "", price: 50 }] })),
    ).toBe(
      "This draft needs at least one size with a price above £0 before it can be saved.",
    );
  });

  it("lists every missing piece in one message", () => {
    expect(
      bulkAddDraftError(
        draft({ imageUrl: "", title: "", sizes: [{ label: "", price: 0 }] }),
      ),
    ).toBe(
      "This draft needs an image, a title and at least one size with a price above £0 before it can be saved.",
    );
  });
});

describe("partitionBulkAddDrafts", () => {
  it("splits drafts into valid and errored without losing any", () => {
    const complete = draft({ draftId: "ok" });
    const noPrice = draft({
      draftId: "bad-price",
      sizes: [{ label: "A3", price: 0 }],
    });
    const noImage = draft({ draftId: "bad-image", imageUrl: "" });

    const { valid, errors } = partitionBulkAddDrafts([complete, noPrice, noImage]);

    expect(valid.map((d) => d.draftId)).toEqual(["ok"]);
    expect([...errors.keys()].sort()).toEqual(["bad-image", "bad-price"]);
    expect(valid.length + errors.size).toBe(3);
  });

  it("preserves draft order in the valid list", () => {
    const a = draft({ draftId: "a" });
    const b = draft({ draftId: "b" });
    const { valid } = partitionBulkAddDrafts([a, b]);
    expect(valid.map((d) => d.draftId)).toEqual(["a", "b"]);
  });

  it("returns an empty error map when everything is complete", () => {
    const { valid, errors } = partitionBulkAddDrafts([draft()]);
    expect(valid).toHaveLength(1);
    expect(errors.size).toBe(0);
  });
});
