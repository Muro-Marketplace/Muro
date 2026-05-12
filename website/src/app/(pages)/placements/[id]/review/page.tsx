"use client";

// Placement review form — backs the link in the placement_review_request
// cron email. Both parties get the email and land here independently.
//
// Star picker + optional comment. POSTs to /api/placements/[id]/review,
// which fans out an email + bell notification to the counterparty.

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/api-client";

export default function PlacementReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-serif mb-2">Sign in to leave a review</h1>
          <p className="text-sm text-muted mb-5">You need to be signed in as one of the placement parties to leave a review.</p>
          <Link href={`/login?next=/placements/${encodeURIComponent(id)}/review`} className="text-sm text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C17C5A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-serif mb-2">Review submitted</h1>
          <p className="text-sm text-muted mb-6">Thanks. Your feedback has been shared with the other party.</p>
          <Link href={`/placements/${encodeURIComponent(id)}`} className="text-sm text-accent hover:underline">
            Back to placement
          </Link>
        </div>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      setError("Pick a star rating first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(`/api/placements/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, text: text.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Couldn't submit. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      // Soft refresh the placement page in the background so the
      // user sees their review reflected if they navigate back.
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <form onSubmit={submit} className="w-full max-w-md">
        <h1 className="text-2xl font-serif mb-2 text-center">Leave a review</h1>
        <p className="text-sm text-muted text-center mb-8">How was the experience? Your feedback helps other artists and venues find good fits.</p>

        <div className="flex justify-center gap-1 mb-6" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (hoverRating || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoverRating(n)}
                onMouseLeave={() => setHoverRating(0)}
                className="text-3xl transition-colors leading-none"
                style={{ color: filled ? "#C17C5A" : "#D8D3CC" }}
              >
                ★
              </button>
            );
          })}
        </div>

        <label className="block text-xs text-muted mb-2" htmlFor="review-text">Comments (optional)</label>
        <textarea
          id="review-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          rows={5}
          placeholder="What worked well? Anything that could have been better?"
          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
        />

        {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !rating}
          className="w-full mt-6 px-4 py-3 text-sm font-medium text-white bg-accent hover:bg-accent/90 rounded-sm transition-colors disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit review"}
        </button>

        <p className="text-center mt-4">
          <Link href={`/placements/${encodeURIComponent(id)}`} className="text-xs text-muted hover:text-foreground">
            Cancel
          </Link>
        </p>
      </form>
    </div>
  );
}
