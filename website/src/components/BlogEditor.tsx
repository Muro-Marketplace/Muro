"use client";

// Phase 2.7 I1: simplified textarea-based blog editor. Phase 3 will
// swap in a TipTap-backed rich text experience; for now we ship
// markdown so the data model + admin flow can be exercised without
// pulling a heavy editor dependency.
//
// Saves on every change with a debounced PATCH (when editing) or a
// click-to-create POST (when new). Submit-for-review is a separate
// button that flips status to pending_review and enqueues the
// moderation row server-side.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { describeSaveError } from "@/lib/blogs/describe-save-error";

interface BlogEditorProps {
  blogId?: string;
  initialTitle?: string;
  initialBody?: string;
  initialCover?: string | null;
  initialFeatured?: string[];
  status?: string;
}

export default function BlogEditor({
  blogId,
  initialTitle = "",
  initialBody = "",
  initialCover = null,
  initialFeatured = [],
  status: initialStatus,
}: BlogEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [cover, setCover] = useState(initialCover ?? "");
  const [featured, setFeatured] = useState<string[]>(initialFeatured);
  const [status, setStatus] = useState(initialStatus ?? "draft");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(blogId ?? null);

  // Track artist works so the featured picker has something to pick.
  const [worksOptions, setWorksOptions] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/artist-works");
        if (cancelled || !res.ok) return;
        const data = await res.json();
        setWorksOptions(
          (data.works ?? []).map((w: { id: string; title: string }) => ({
            id: w.id,
            title: w.title,
          })),
        );
      } catch {
        // best-effort
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveExisting = useCallback(async () => {
    if (!currentId) return;
    setSaving("saving");
    try {
      // bug-12: mutate throws on a non-2xx (ApiError carries the parsed body as
      // .payload), so a rejected save cannot report "saved". The old authFetch
      // resolved on a non-2xx and relied on a manual res.ok check.
      await mutate(`/api/blogs/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body_markdown: body,
          cover_image_url: cover.trim() ? cover.trim() : null,
          featured_artwork_ids: featured,
        }),
      });
      setSaving("saved");
      setError(null);
    } catch (err) {
      setSaving("error");
      setError(err instanceof ApiError ? describeSaveError(err.payload) : "Network error");
    }
  }, [currentId, title, body, cover, featured]);

  // Debounced auto-save when editing an existing post. Skips when the
  // post is past the author-editable state (pending_review, published,
  // rejected, archived) so further keystrokes don't silently overwrite
  // a post that's already in review or live. Audit follow-up.
  const canAutoSave = status === "draft" || status === "rejected";
  // QA 2026-08-30 bug 16: the action row already rendered only for draft and
  // rejected, so a published (or in-review) post showed a fully working-looking
  // form with no way to save and silently discarded every edit on navigation.
  // The fields follow the same rule as the buttons now, and say why.
  //
  // Deliberately read-only rather than adding a Save: PATCH /api/blogs/[id]
  // does not re-enter moderation on a content edit, so a Save button here
  // would let an artist change live, already-approved copy to anything at all.
  const isEditable = canAutoSave;
  useEffect(() => {
    if (!currentId) return;
    if (!canAutoSave) return;
    if (!title.trim() || !body.trim()) return;
    const t = setTimeout(saveExisting, 800);
    return () => clearTimeout(t);
  }, [currentId, title, body, cover, featured, saveExisting, canAutoSave]);

  // Returns the new blog id so callers awaiting create can chain a
  // PATCH against the right URL — the React `currentId` state isn't
  // updated synchronously, so reading it right after setCurrentId
  // would still see the stale null. Audit follow-up.
  //
  // `navigate: false` is the submit-for-review path (row 2442). On
  // /artist-portal/blogs/new that flow creates the draft and then PATCHes it
  // for review. When the PATCH is refused (`422` with an `issues` array saying
  // exactly what is wrong), the `router.replace` fired by the create had
  // already sent the author to the edit page, so the editor holding the error
  // was on its way off screen and a fresh one mounted showing a draft. The
  // refusal reached nobody and the author believed they had submitted. Navigate
  // once the whole flow has settled instead.
  async function handleCreate({ navigate = true }: { navigate?: boolean } = {}): Promise<string | null> {
    setSaving("saving");
    setError(null);
    try {
      const data = await mutate<{ blog: { id: string } }>("/api/blogs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body_markdown: body,
          cover_image_url: cover.trim() || undefined,
          featured_artwork_ids: featured,
        }),
      });
      setCurrentId(data.blog.id);
      setSaving("saved");
      if (navigate) router.replace(`/artist-portal/blogs/${data.blog.id}/edit`);
      return data.blog.id;
    } catch (err) {
      setSaving("error");
      setError(err instanceof ApiError ? describeSaveError(err.payload) : "Network error");
      return null;
    }
  }

  async function handleSubmitForReview() {
    if (!title.trim() || !body.trim()) {
      setError("Add a title and body before submitting for review");
      return;
    }
    let id = currentId;
    let created = false;
    if (!id) {
      id = await handleCreate({ navigate: false });
      if (!id) return; // create failed, error already set
      created = true;
    }
    setSaving("saving");
    try {
      await mutate(`/api/blogs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body_markdown: body,
          cover_image_url: cover.trim() ? cover.trim() : null,
          featured_artwork_ids: featured,
          submit_for_review: true,
        }),
      });
      setStatus("pending_review");
      setSaving("saved");
      // Only now, with the submission accepted. A refusal keeps the author on
      // the page that is showing them why.
      if (created) router.replace(`/artist-portal/blogs/${id}/edit`);
    } catch (err) {
      setSaving("error");
      setError(err instanceof ApiError ? describeSaveError(err.payload) : "Network error");
    }
  }

  function toggleFeatured(workId: string) {
    setFeatured((prev) =>
      prev.includes(workId) ? prev.filter((id) => id !== workId) : [...prev, workId],
    );
  }

  return (
    <div className="max-w-2xl px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif">{currentId ? "Edit blog" : "New blog"}</h1>
        <span className="text-[11px] text-muted">
          Status: <strong className="text-foreground">{status}</strong>
        </span>
      </div>

      {error && (
        <p className="text-sm text-red-600 mb-4">{error}</p>
      )}

      {!isEditable && (
        <div className="mb-4 border border-border bg-surface rounded-sm p-3">
          <p className="text-sm text-foreground">
            {status === "published"
              ? "This post is published, so it cannot be edited here."
              : "This post is with the Wallplace team for review, so it cannot be edited until they have looked at it."}
          </p>
          <p className="text-xs text-muted mt-1">
            {status === "published"
              ? "Published posts have already been reviewed. To change this one, contact support and we will take it back into draft for you."
              : "You will get an email once it has been reviewed. If it needs changes, you will be able to edit it then."}
          </p>
        </div>
      )}

      <div className="space-y-4">
        <label className="block text-xs text-muted">
          Title
          <input
            type="text"
            disabled={!isEditable}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={180}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block text-xs text-muted">
          Cover image URL (optional)
          <input
            type="url"
            disabled={!isEditable}
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            placeholder="https://"
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none"
          />
        </label>

        <label className="block text-xs text-muted">
          Body (markdown)
          <textarea
          disabled={!isEditable}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none font-mono"
          />
          <span className="block mt-1 text-[10px] text-muted/70">
            Plain-text/markdown for now. Phase 3 introduces a rich-text editor.
          </span>
        </label>

        <div className="text-xs text-muted">
          <p className="mb-2">Featured works (optional)</p>
          {worksOptions.length === 0 ? (
            <p className="text-[11px] text-muted/70">
              Add works to your portfolio first; you can feature any of them in your posts.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-border rounded-sm p-2">
              {worksOptions.map((w) => (
                <label key={w.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    disabled={!isEditable}
                    checked={featured.includes(w.id)}
                    onChange={() => toggleFeatured(w.id)}
                  />
                  <span className="truncate text-[11px] text-foreground">{w.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-border">
          <span className="text-[11px] text-muted">
            {saving === "saving" && "Saving…"}
            {saving === "saved" && "Saved"}
            {saving === "error" && "Save failed"}
          </span>
          <div className="flex gap-2">
            {!currentId && (
              <button
                onClick={() => { void handleCreate(); }}
                className="px-3 py-2 text-sm rounded-sm border border-border hover:border-accent/40"
                disabled={!title.trim() || !body.trim()}
              >
                Save as draft
              </button>
            )}
            {(status === "draft" || status === "rejected") && (
              <button
                onClick={handleSubmitForReview}
                className="px-3 py-2 text-sm rounded-sm bg-accent text-white hover:bg-accent-hover"
                disabled={!title.trim() || !body.trim()}
              >
                Submit for review
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
