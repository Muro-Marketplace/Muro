"use client";

// Artist portal enquiries (E1/E5/E27, QA 2026-08-28).
//
// Enquiries are messages from the public artist page's enquiry form, keyed
// on artist_slug — they were always addressed to ARTISTS, yet the only
// portal surface ever built for them was a dead venue-portal page fetching
// a GET that did not exist. That page is gone; this one lists the signed-in
// artist's enquiries from GET /api/enquiry and lets them mark each one
// handled (PATCH). Each enquiry also lands in the messages inbox and
// triggers an email, so this page is the tidy-up view, not the only signal.

import { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { enquiryTypeLabel } from "@/lib/enquiry-types";

interface Enquiry {
  id: number | string;
  sender_name: string | null;
  sender_email: string | null;
  work_title: string | null;
  enquiry_type: string | null;
  message: string | null;
  status: string | null;
  created_at: string | null;
}

type FilterTab = "All" | "New" | "Handled";

const FILTER_TABS: FilterTab[] = ["All", "New", "Handled"];

function isHandled(e: Enquiry): boolean {
  return e.status === "handled";
}

function statusBadge(handled: boolean) {
  return handled ? (
    <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium border rounded-full bg-background text-muted border-border">
      Handled
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium border rounded-full bg-amber-50 text-amber-700 border-amber-200">
      New
    </span>
  );
}

export default function ArtistEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [updatingId, setUpdatingId] = useState<Enquiry["id"] | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/enquiry")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(
            (data && typeof data.error === "string" && data.error) || "Could not load enquiries.",
          );
          return;
        }
        setEnquiries(Array.isArray(data?.enquiries) ? data.enquiries : []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load enquiries. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function setStatus(enquiry: Enquiry, status: "pending" | "handled") {
    setUpdatingId(enquiry.id);
    setUpdateError(null);
    try {
      await mutate("/api/enquiry", {
        method: "PATCH",
        body: JSON.stringify({ id: enquiry.id, status }),
      });
      setEnquiries((prev) => prev.map((e) => (e.id === enquiry.id ? { ...e, status } : e)));
    } catch (err) {
      setUpdateError(
        err instanceof ApiError
          ? err.message || "Could not update the enquiry. Please try again."
          : "Network error. Please try again.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = enquiries.filter((e) => {
    if (activeFilter === "All") return true;
    return activeFilter === "Handled" ? isHandled(e) : !isHandled(e);
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl">Enquiries</h1>
        <p className="text-sm text-muted mt-1">
          Messages sent through the enquiry form on your public profile. Each one
          also lands in your Messages inbox.
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {FILTER_TABS.map((tab) => {
          const count =
            tab === "All"
              ? enquiries.length
              : enquiries.filter((e) => (tab === "Handled" ? isHandled(e) : !isHandled(e))).length;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 -mb-px cursor-pointer ${
                activeFilter === tab
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {tab}
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-background border border-border rounded-full text-muted">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {updateError && <p className="text-xs text-red-600 mb-4">{updateError}</p>}

      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading enquiries...</p>
      ) : loadError ? (
        <p className="text-sm text-red-600 py-12 text-center">{loadError}</p>
      ) : filtered.length === 0 ? (
        activeFilter === "All" ? (
          <EmptyState
            title="No enquiries yet"
            hint="When someone sends an enquiry from your public profile, it will appear here."
            cta={{ label: "View your public profile", href: "/artist-portal/profile" }}
          />
        ) : (
          <p className="text-center text-muted text-sm py-10">No enquiries in this category.</p>
        )
      ) : (
        <div className="space-y-3">
          {filtered.map((enquiry) => {
            const handled = isHandled(enquiry);
            return (
              <div key={enquiry.id} className="bg-surface border border-border rounded-sm p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {enquiry.sender_name || "Someone"}
                      {enquiry.sender_email && (
                        <span className="font-normal text-muted"> &middot; {enquiry.sender_email}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {enquiry.created_at
                        ? new Date(enquiry.created_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : ""}
                    </p>
                  </div>
                  {statusBadge(handled)}
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-background border border-border rounded-sm text-foreground/70">
                    {enquiryTypeLabel(enquiry.enquiry_type)}
                  </span>
                  {enquiry.work_title && (
                    <span className="text-xs text-muted">Re: {enquiry.work_title}</span>
                  )}
                </div>

                {enquiry.message && (
                  <p className="text-sm text-foreground/90 leading-snug whitespace-pre-wrap mb-3">
                    {enquiry.message}
                  </p>
                )}

                <div className="flex items-center gap-4">
                  {enquiry.sender_email && (
                    <a
                      href={`mailto:${encodeURIComponent(enquiry.sender_email)}?subject=${encodeURIComponent(
                        enquiry.work_title ? `Re: ${enquiry.work_title}` : "Your Wallplace enquiry",
                      )}`}
                      className="text-xs text-accent hover:underline"
                    >
                      Reply by email
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setStatus(enquiry, handled ? "pending" : "handled")}
                    disabled={updatingId === enquiry.id}
                    className="text-xs text-accent hover:underline cursor-pointer disabled:opacity-50"
                  >
                    {updatingId === enquiry.id
                      ? "Saving..."
                      : handled
                        ? "Mark as new"
                        : "Mark handled"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
