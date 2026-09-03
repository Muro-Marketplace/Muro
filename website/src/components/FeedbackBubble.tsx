"use client";

// Phase 2.6. Fixed bottom-right feedback bubble. Two tabs: feature
// request and feedback. Submissions hit /api/moderation, which stores
// them in moderation_queue for the admin pool. The bubble itself is
// mounted by the public + portal layouts; legal pages (/terms,
// /privacy, /cookies, etc.) opt out so the chrome stays clean.
//
// Full-screen editors share the bottom-right corner (the wall
// visualiser's Preview pill sits exactly where this button does), so
// they hold the bubble hidden through feedback-bubble-visibility while
// they are mounted.

import { useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { useFeedbackBubbleHidden } from "@/lib/ui/feedback-bubble-visibility";

const MINIMISED_KEY = "wallplace.feedback.minimised";

type Tab = "feature" | "feedback";

// Routes where the bubble should NOT render (legal copy etc.). The
// match is exact-or-prefix so /terms and /terms/something both opt
// out. Keep the list short; new pages opt in by default.
const HIDDEN_PREFIXES = [
  "/terms",
  "/privacy",
  "/cookies",
  "/ip-policy",
  "/artist-agreement",
  "/venue-agreement",
];

export default function FeedbackBubble() {
  const pathname = usePathname() ?? "";
  const isHidden = HIDDEN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const hiddenByEditor = useFeedbackBubbleHidden();

  const [open, setOpen] = useState(false);
  // Minimised to a small dot; remembered per browser so it stays out of the
  // way once dismissed. Reads and writes are guarded: storage can be absent.
  const [minimised, setMinimised] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(MINIMISED_KEY) === "1";
    } catch {
      return false;
    }
  });
  function persistMinimised(next: boolean) {
    setMinimised(next);
    try {
      window.localStorage.setItem(MINIMISED_KEY, next ? "1" : "0");
    } catch {
      // storage unavailable, the choice lasts for this page only
    }
  }
  const [tab, setTab] = useState<Tab>("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (isHidden || hiddenByEditor) return null;

  function resetForm() {
    setTitle("");
    setDescription("");
    setMessage("");
    setRating(null);
    setEmail("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body =
        tab === "feature"
          ? {
              entity_type: "feature_request",
              title: title.trim(),
              description: description.trim(),
              contact_email: email.trim() || undefined,
            }
          : {
              entity_type: "feedback",
              message: message.trim(),
              rating: rating ?? undefined,
              contact_email: email.trim() || undefined,
              source_url: pathname || undefined,
            };
      const res = await fetch("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast("Thanks, we'll have a look.");
        resetForm();
        setTimeout(() => {
          setToast(null);
          setOpen(false);
        }, 1200);
      } else if (res.status === 429) {
        setToast("Try again in a minute.");
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || "Couldn't send. Try again in a minute.");
      }
    } catch {
      setToast("Couldn't send. Check your connection.");
    } finally {
      setSubmitting(false);
    }
  }

  if (minimised) {
    return (
      <button
        type="button"
        onClick={() => persistMinimised(false)}
        aria-label="Show feedback button"
        title="Feedback"
        className="fixed bottom-3 right-3 z-40 w-9 h-9 rounded-full bg-accent-text/80 text-white shadow-md hover:bg-accent-text grid place-items-center"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }
  return (
    <>
      {/* Hide control: a small minus beside the pill (owner instruction,
          3 September 2026) so the pill can be got out of the way. */}
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          persistMinimised(true);
        }}
        aria-label="Hide feedback button"
        title="Hide"
        className="fixed bottom-3 right-[7.25rem] z-40 w-6 h-6 rounded-full bg-white/90 border border-border text-stone-600 text-sm leading-none shadow hover:bg-white grid place-items-center"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Feedback and feature requests"
        className="fixed bottom-3 right-3 z-40 inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-full bg-accent-text text-white text-xs font-medium shadow-md hover:bg-accent-text-hover transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        Feedback
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Feedback"
          className="fixed bottom-16 right-3 z-40 w-[360px] max-w-[calc(100vw-1.5rem)] bg-surface border border-border rounded-sm shadow-lg overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-border bg-background/40">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-[11px] text-muted leading-relaxed">
                Wallplace is in early launch. Help shape it.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback panel"
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "feature"}
                onClick={() => setTab("feature")}
                className={`flex-1 px-2 py-1.5 text-xs rounded-sm border transition-colors ${
                  tab === "feature"
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                Feature request
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "feedback"}
                onClick={() => setTab("feedback")}
                className={`flex-1 px-2 py-1.5 text-xs rounded-sm border transition-colors ${
                  tab === "feedback"
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                Feedback
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3">
            {tab === "feature" ? (
              <>
                <label className="block text-[11px] text-muted">
                  Title
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    minLength={2}
                    maxLength={80}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block text-[11px] text-muted">
                  Description
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    minLength={2}
                    maxLength={1000}
                    rows={4}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="block text-[11px] text-muted">
                  Message
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    minLength={2}
                    maxLength={1000}
                    rows={4}
                    className="mt-1 w-full px-2.5 py-1.5 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none"
                  />
                </label>
                <fieldset className="text-[11px] text-muted">
                  <legend className="mb-1">Rating (optional)</legend>
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating((r) => (r === n ? null : n))}
                        aria-label={`${n} star${n === 1 ? "" : "s"}`}
                        className={`text-base ${
                          rating !== null && n <= rating
                            ? "text-amber-500"
                            : "text-muted/40"
                        } hover:text-amber-500`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            <label className="block text-[11px] text-muted">
              Email (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder="So we can reply"
                className="mt-1 w-full px-2.5 py-1.5 text-sm border border-border rounded-sm bg-white focus:border-accent focus:outline-none"
              />
            </label>
            {toast && (
              <p className="text-[11px] text-foreground bg-accent/5 border border-accent/20 px-2.5 py-1.5 rounded-sm">
                {toast}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 text-xs rounded-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
