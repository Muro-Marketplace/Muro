"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { mutate, apiErrorMessage } from "@/lib/api-client";
import { loginPathWithNext } from "@/lib/login-redirect";
import { REPORT_REASONS, type ReportableEntityType, type ReportReason } from "@/lib/validations";

/**
 * "Report this" on an artwork, an artist profile, a venue profile or a
 * collection.
 *
 * Conversations have had a report path since #20; the marketplace's own
 * content had none, so an artwork that was not the artist's own work, or a
 * profile impersonating a real gallery, could be seen by everyone and flagged
 * by nobody.
 *
 * Deliberately quiet: a small text link, not a button competing with Buy. The
 * people who need it will look for it, and everyone else should not have their
 * eye drawn to it on an artwork page.
 */
const REASON_LABELS: Record<ReportReason, string> = {
  not_the_artists_own_work: "This is not the artist's own work",
  offensive_or_explicit: "Offensive or explicit content",
  misleading_or_scam: "Misleading, or a scam",
  spam: "Spam",
  impersonation: "Impersonating someone else",
  other: "Something else",
};

export interface ReportContentButtonProps {
  entityType: ReportableEntityType;
  /** Slug for a profile, id for a work or a collection. */
  entityId: string;
  /** What the thing is called, used in the dialog title only. */
  entityLabel?: string;
  className?: string;
}

export default function ReportContentButton({
  entityType,
  entityId,
  entityLabel,
  className = "",
}: ReportContentButtonProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("not_the_artists_own_work");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function submit() {
    // "other" with no detail tells a moderator nothing, so it is the one case
    // where the textarea is required.
    if (reason === "other" && !detail.trim()) {
      showToast("Tell us a little about what is wrong.", { variant: "error" });
      return;
    }
    setSubmitting(true);
    try {
      await mutate("/api/reports", {
        method: "POST",
        body: JSON.stringify({ entityType, entityId, reason, detail: detail.trim() }),
      });
      // Only after the server confirms. submitFlagAction's lesson: a
      // confirmation shown regardless of the response is how a person comes to
      // believe a harasser was blocked when nothing was written.
      setDone(true);
    } catch (err) {
      showToast(apiErrorMessage(err, "We could not send that report. Please try again."), {
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const label = entityLabel ? `"${entityLabel}"` : "this";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-muted underline underline-offset-2 hover:text-foreground transition-colors ${className}`}
      >
        Report this
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Report ${label}`}
            className="w-full sm:max-w-md bg-surface border border-border rounded-t-sm sm:rounded-sm p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <>
                <h2 className="font-serif text-xl mb-2">Thank you</h2>
                <p className="text-sm text-muted mb-5">
                  We have your report and someone will look at it. We will not tell the owner who
                  reported them.
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full py-2.5 bg-accent text-white text-sm rounded-sm hover:bg-accent-hover transition-colors"
                >
                  Close
                </button>
              </>
            ) : !user ? (
              <>
                <h2 className="font-serif text-xl mb-2">Report {label}</h2>
                <p className="text-sm text-muted mb-5">
                  Please sign in to report content, so we can follow up with you if we need to. If
                  you would rather not, you can{" "}
                  <Link href="/contact" className="text-accent-text underline">
                    contact us
                  </Link>{" "}
                  instead.
                </p>
                <div className="flex gap-2">
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex-1 py-2.5 border border-border text-sm rounded-sm hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                  <Link
                    href={loginPathWithNext(
                      typeof window === "undefined" ? "/" : window.location.pathname,
                      typeof window === "undefined" ? "" : window.location.search,
                    )}
                    className="flex-1 py-2.5 bg-accent text-white text-sm rounded-sm text-center hover:bg-accent-hover transition-colors"
                  >
                    Sign in
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-serif text-xl mb-1">Report {label}</h2>
                <p className="text-sm text-muted mb-4">
                  Tell us what is wrong and we will look into it. The owner is not told who
                  reported them.
                </p>

                <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  className="w-full mb-4 px-3 py-2.5 bg-background border border-border rounded-sm text-sm"
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {REASON_LABELS[r]}
                    </option>
                  ))}
                </select>

                <label className="block text-xs uppercase tracking-wide text-muted mb-1.5">
                  Anything else {reason === "other" ? "" : "(optional)"}
                </label>
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value.slice(0, 2000))}
                  rows={3}
                  maxLength={2000}
                  placeholder="What should we look at?"
                  className="w-full mb-5 px-3 py-2.5 bg-background border border-border rounded-sm text-sm resize-none"
                />

                <div className="flex gap-2">
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={submitting}
                    className="flex-1 py-2.5 border border-border text-sm rounded-sm hover:bg-background transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="flex-1 py-2.5 bg-accent text-white text-sm rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Sending" : "Send report"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
