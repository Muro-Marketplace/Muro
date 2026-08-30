"use client";

// Phase 2.3 K3. Customer order tracking page. Renders a vertical
// stepper derived from order_events. The stepper lights up each step
// once the matching event_type has fired; the "Confirm delivery" CTA
// surfaces while the order is delivered but not yet confirmed.
//
// Auth: works for signed-in customers AND guest buyers who land via
// the receipt email's `?t=<signed-token>` link.

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";

interface OrderEvent {
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  actor_user_id: string | null;
}

interface OrderSummary {
  id: string;
  status: string;
  buyerEmail: string | null;
  items: unknown;
  total: number | null;
  currency: string | null;
  placedAt: string;
}

interface StepDef {
  key: string;
  label: string;
  hint: string;
}

// B29: category options for the dispute form. POST /api/disputes stores the
// raw string (2 to 100 chars) and the admin panel displays it verbatim, so
// readable labels double as values.
const DISPUTE_CATEGORIES = [
  "Damaged in transit",
  "Item not received",
  "Not as described",
  "Other",
] as const;

const STEPS: StepDef[] = [
  { key: "order.placed", label: "Placed", hint: "We received your order." },
  { key: "order.processing", label: "Processing", hint: "The artist is preparing your piece." },
  { key: "order.out_for_delivery", label: "Out for delivery", hint: "On its way." },
  { key: "order.delivered", label: "Delivered", hint: "Marked as arrived by you, the buyer." },
  { key: "order.delivery_confirmed", label: "Confirmed", hint: "You confirmed receipt. Thank you." },
];

function StepIcon({ status }: { status: "done" | "current" | "pending" }) {
  if (status === "done") {
    return (
      <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center shrink-0">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2 7 5.5 10.5 12 3.5" />
        </svg>
      </div>
    );
  }
  if (status === "current") {
    return (
      <div className="w-7 h-7 rounded-full border-2 border-accent bg-white flex items-center justify-center shrink-0">
        <div className="w-2 h-2 rounded-full bg-accent" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full border-2 border-border bg-white shrink-0" />
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function OrderTrackingPage() {
  const params = useParams<{ id: string }>();
  const orderId = params?.id ?? "";
  // Receipt-email tracking links carry ?t=<signed-token>. Read it
  // directly off window.location to avoid wrapping the page in a
  // Suspense boundary — same pattern /orders/track uses. `tokenReady`
  // guards the first fetch so we don't fire an unauthenticated GET
  // that would 401 then immediately re-fire with the token (which
  // briefly flashed an error to every guest viewer).
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setTrackingToken(new URLSearchParams(window.location.search).get("t"));
    setTokenReady(true);
  }, []);
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // B29: buyer dispute entry. POST /api/disputes requires a signed-in
  // party (Bearer auth), so the form only shows for signed-in viewers;
  // guests who arrived via the receipt-email token get a mailto fallback.
  const { user, loading: authLoading } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<string>(DISPUTE_CATEGORIES[0]);
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const reportMailto = `mailto:hello@wallplace.co.uk?subject=${encodeURIComponent(`Problem with order ${orderId}`)}`;

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const qs = trackingToken ? `?t=${encodeURIComponent(trackingToken)}` : "";
      const url = `/api/orders/${orderId}/events${qs}`;
      const res = trackingToken ? await fetch(url) : await authFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `Could not load order (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      setOrder(data.order ?? null);
      setEvents(data.events ?? []);
      setError(null);
    } catch {
      setError("Network error, please try again.");
    } finally {
      setLoading(false);
    }
  }, [orderId, trackingToken]);

  useEffect(() => {
    if (!tokenReady) return;
    load();
  }, [load, tokenReady]);

  async function handleConfirm() {
    setConfirming(true);
    try {
      // Thread the token through so guest viewers can confirm too.
      const qs = trackingToken ? `?t=${encodeURIComponent(trackingToken)}` : "";
      const url = `/api/orders/${orderId}/events${qs}`;
      const init = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: "order.delivery_confirmed" }),
      } as const;
      const res = trackingToken ? await fetch(url, init) : await authFetch(url, init);
      if (!res.ok) {
        setError("Could not confirm delivery, please try again.");
      } else {
        await load();
      }
    } finally {
      setConfirming(false);
    }
  }

  async function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reportDescription.trim().length < 10) {
      setReportError("Please describe the problem in at least 10 characters.");
      return;
    }
    setReportSubmitting(true);
    setReportError(null);
    try {
      await mutate("/api/disputes", {
        method: "POST",
        body: JSON.stringify({
          orderId,
          category: reportCategory,
          description: reportDescription.trim(),
        }),
      });
      setReportSubmitted(true);
    } catch (err) {
      setReportError(
        err instanceof ApiError
          ? err.message || "Could not open the case. Please try again."
          : "Network error, please try again.",
      );
    } finally {
      setReportSubmitting(false);
    }
  }

  // Map event type → first event with that type so each step lights up
  // on its earliest occurrence.
  const eventByType = new Map<string, OrderEvent>();
  for (const ev of events) {
    if (!eventByType.has(ev.event_type)) eventByType.set(ev.event_type, ev);
  }

  // Cancelled / refunded short-circuit the stepper: any later step is
  // moot once the order is dead.
  const cancelled = eventByType.has("order.cancelled");

  // Index of the latest step we've reached, for current/pending tinting.
  const latestStepIndex = STEPS.reduce(
    (acc, step, idx) => (eventByType.has(step.key) ? idx : acc),
    -1,
  );

  const isDelivered = eventByType.has("order.delivered");
  const isConfirmed = eventByType.has("order.delivery_confirmed");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          {/* Guests who arrived via the receipt-email token can't
              reach the customer portal without signing in, so
              point them at the public tracking lookup instead. */}
          <Link
            href={trackingToken ? "/orders/track" : "/customer-portal"}
            className="text-sm text-muted hover:text-accent"
          >
            &larr; {trackingToken ? "Look up another order" : "Back to orders"}
          </Link>
          <h1 className="text-2xl lg:text-3xl mt-3">Order {orderId}</h1>
          {order?.placedAt && (
            <p className="text-sm text-muted mt-1">
              Placed {formatDate(order.placedAt)}
            </p>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : !order ? (
          <div className="rounded-sm border border-border bg-surface p-6">
            <p className="text-sm text-foreground mb-2">Order not found.</p>
            <p className="text-xs text-muted">
              Double-check the order ID, or{" "}
              <Link href="/orders/track" className="text-accent hover:underline">
                use the order-tracking lookup
              </Link>{" "}
              with your email + order number.
            </p>
          </div>
        ) : (
          <>
            {cancelled && (
              <div className="mb-6 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                This order was cancelled.
                {eventByType.get("order.cancelled")?.created_at && (
                  <> ({formatDate(eventByType.get("order.cancelled")!.created_at)})</>
                )}
              </div>
            )}

            <ol className="relative bg-surface border border-border rounded-sm divide-y divide-border">
              {STEPS.map((step, idx) => {
                const ev = eventByType.get(step.key);
                const status: "done" | "current" | "pending" =
                  ev != null
                    ? "done"
                    : idx === latestStepIndex + 1
                      ? "current"
                      : "pending";
                return (
                  <li key={step.key} className="flex items-start gap-4 px-5 py-4">
                    <StepIcon status={status} />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          status === "pending" ? "text-muted" : "text-foreground"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className="text-xs text-muted mt-0.5">{step.hint}</p>
                      {ev && (
                        <p className="text-[11px] text-muted mt-1">
                          {formatDate(ev.created_at)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {isDelivered && !isConfirmed && !cancelled && (
              <div className="mt-6 rounded-sm border border-accent/30 bg-accent/5 px-5 py-5">
                <p className="text-sm font-medium text-foreground mb-1">
                  Did everything arrive in good order?
                </p>
                <p className="text-xs text-muted mb-4">
                  Confirming records that the order arrived safely and closes it off.
                  We&rsquo;ll auto-confirm after 7 days if we don&rsquo;t hear from you.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="px-4 py-2 text-sm rounded-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {confirming ? "Confirming…" : "Confirm delivery"}
                  </button>
                  {user ? (
                    <button
                      type="button"
                      onClick={() => setReportOpen(true)}
                      className="px-4 py-2 text-sm rounded-sm border border-border hover:border-accent/40"
                    >
                      Report a problem
                    </button>
                  ) : (
                    <a
                      href={reportMailto}
                      className="px-4 py-2 text-sm rounded-sm border border-border hover:border-accent/40"
                    >
                      Report a problem
                    </a>
                  )}
                </div>
              </div>
            )}

            {isConfirmed && (
              <p className="mt-6 text-sm text-muted">
                Confirmed on {formatDate(eventByType.get("order.delivery_confirmed")!.created_at)}.{" "}
                {user ? (
                  <button
                    type="button"
                    onClick={() => setReportOpen(true)}
                    className="text-accent hover:underline"
                  >
                    Report a problem
                  </button>
                ) : (
                  <a href={reportMailto} className="text-accent hover:underline">
                    Report a problem
                  </a>
                )}
                .
              </p>
            )}

            {/* B29: standing dispute entry. Always present once the order
                loads, because a problem is not gated on delivery: an order
                stuck in processing needs this path too. */}
            <div className="mt-6 rounded-sm border border-border bg-surface px-5 py-5">
              {reportSubmitted ? (
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Problem reported</p>
                  <p className="text-xs text-muted">
                    We&rsquo;ve opened a case and emailed both you and the artist.
                    Reply to that email within 3 business days with your side and
                    any photos. We hold the payout while the case is open.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Problem with this order?
                  </p>
                  {authLoading ? null : user ? (
                    !reportOpen ? (
                      <>
                        <p className="text-xs text-muted mb-4">
                          Tell us what went wrong and we&rsquo;ll open a case with
                          the artist. We hold the payout while the case is open.
                        </p>
                        <button
                          type="button"
                          onClick={() => setReportOpen(true)}
                          className="px-4 py-2 text-sm rounded-sm border border-border hover:border-accent/40"
                        >
                          Report a problem
                        </button>
                      </>
                    ) : (
                      <form onSubmit={handleReportSubmit} className="mt-2">
                        <label
                          htmlFor="dispute-category"
                          className="block text-xs uppercase tracking-wider text-muted mb-1.5"
                        >
                          What went wrong?
                        </label>
                        <select
                          id="dispute-category"
                          value={reportCategory}
                          onChange={(e) => setReportCategory(e.target.value)}
                          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60"
                        >
                          {DISPUTE_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <label
                          htmlFor="dispute-description"
                          className="block text-xs uppercase tracking-wider text-muted mb-1.5 mt-4"
                        >
                          Describe the problem
                        </label>
                        <textarea
                          id="dispute-description"
                          value={reportDescription}
                          onChange={(e) => setReportDescription(e.target.value)}
                          rows={4}
                          maxLength={2000}
                          required
                          placeholder="What happened, and what would put it right? Photos can follow by email."
                          className="w-full px-3 py-2 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-accent/60 resize-y"
                        />
                        {reportError && (
                          <p className="text-xs text-red-600 mt-2">{reportError}</p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-4">
                          <button
                            type="submit"
                            disabled={reportSubmitting}
                            className="px-4 py-2 text-sm rounded-sm bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                          >
                            {reportSubmitting ? "Sending…" : "Open a case"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReportOpen(false);
                              setReportError(null);
                            }}
                            className="px-4 py-2 text-sm rounded-sm border border-border hover:border-accent/40"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )
                  ) : (
                    <p className="text-xs text-muted">
                      Email us at{" "}
                      <a href={reportMailto} className="text-accent hover:underline">
                        hello@wallplace.co.uk
                      </a>{" "}
                      with your order number and what went wrong, or sign in to
                      open a case here.
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
