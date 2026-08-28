"use client";

// Placement review page — backs the link in the placement_review_request
// cron email and the "read your review" bell/email notification.
//
// F38/F39 (QA 2026-08-28): the page now mirrors the API's rules instead of
// blindly offering the form. It loads GET /api/placements/[id]/review first,
// which returns the placement status, whether reviews are open (terminal
// statuses only), and the reviews visible to this party. A pending or
// active placement shows an honest "reviews open once it has ended" notice;
// a received review renders here, so the notification finally links to a
// page that shows it; an already-submitted review renders read-only in
// place of the form.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authFetch, mutate, ApiError } from "@/lib/api-client";

interface PlacementReview {
  id: string;
  rating: number;
  text: string | null;
  created_at: string;
  direction: "given" | "received";
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5 stars`} className="text-lg leading-none">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} style={{ color: n <= rating ? "#C17C5A" : "#D8D3CC" }}>★</span>
      ))}
    </span>
  );
}

function ReviewCard({ review, heading }: { review: PlacementReview; heading: string }) {
  return (
    <div className="bg-surface border border-border rounded-sm p-4 text-left">
      <p className="text-xs text-muted uppercase tracking-wider mb-2">{heading}</p>
      <Stars rating={review.rating} />
      {review.text && (
        <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{review.text}</p>
      )}
      <p className="text-xs text-muted mt-2">
        {new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </div>
  );
}

export default function PlacementReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [text, setText] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reviewable, setReviewable] = useState<boolean>(false);
  const [reviews, setReviews] = useState<PlacementReview[]>([]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    authFetch(`/api/placements/${encodeURIComponent(id)}/review`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            (data && typeof data.error === "string" && data.error) ||
              "Could not load this placement.",
          );
          return;
        }
        setReviewable(Boolean(data?.reviewable));
        setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load this placement. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, id]);

  if (authLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-serif mb-2">Sign in to see reviews</h1>
          <p className="text-sm text-muted mb-5">You need to be signed in as one of the placement parties to read or leave a review.</p>
          <Link href={`/login?next=/placements/${encodeURIComponent(id)}/review`} className="text-sm text-accent hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (reviewsLoading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (loadError) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-serif mb-2">Reviews unavailable</h1>
          <p className="text-sm text-muted mb-5">{loadError}</p>
          <Link href={`/placements/${encodeURIComponent(id)}`} className="text-sm text-accent hover:underline">
            Back to placement
          </Link>
        </div>
      </div>
    );
  }

  const received = reviews.find((r) => r.direction === "received") || null;
  const given = reviews.find((r) => r.direction === "given") || null;

  // The placement has not ended: no form, no pretence. Any reviews that
  // somehow exist would still render, but the gate means there are none.
  if (!reviewable) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-serif mb-2">Reviews open later</h1>
          <p className="text-sm text-muted mb-5">
            Reviews open once the placement has wound down. Come back after the
            work has been collected or the placement has otherwise ended.
          </p>
          <Link href={`/placements/${encodeURIComponent(id)}`} className="text-sm text-accent hover:underline">
            Back to placement
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
          {received && (
            <div className="mb-6">
              <ReviewCard review={received} heading="Their review of you" />
            </div>
          )}
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
      await mutate(`/api/placements/${encodeURIComponent(id)}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, text: text.trim() || undefined }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.code || "Couldn't submit. Please try again." : "Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* F39: the reviewee lands here from "Tap to read your review". */}
        {received && (
          <div className="mb-8">
            <ReviewCard review={received} heading="Their review of you" />
          </div>
        )}

        {given ? (
          <>
            <ReviewCard review={given} heading="Your review" />
            <p className="text-center mt-4 text-xs text-muted">
              You&rsquo;ve already reviewed this placement.
            </p>
            <p className="text-center mt-2">
              <Link href={`/placements/${encodeURIComponent(id)}`} className="text-xs text-muted hover:text-foreground">
                Back to placement
              </Link>
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
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
        )}
      </div>
    </div>
  );
}
