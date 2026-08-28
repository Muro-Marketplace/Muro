"use client";

// Venue creates a new artwork request. The form itself lives in
// `ArtworkRequestForm` so the edit route can render an identical UI;
// this page just wires the POST callback + redirect.

import { useRouter } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { mutate, ApiError } from "@/lib/api-client";
import ArtworkRequestForm, { type ArtworkRequestPayload } from "@/components/artwork-requests/ArtworkRequestForm";
import { recordSubmission } from "@/lib/recent-artwork-requests";

export default function NewArtworkRequestPage() {
  const router = useRouter();

  async function submit(payload: ArtworkRequestPayload) {
    // mutate throws ApiError on a non-2xx, whose .message keeps the old
    // body.message -> body.error precedence for the form's error display.
    let data: { id: string };
    try {
      data = await mutate<{ id: string }>("/api/artwork-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new Error(
        err instanceof ApiError ? err.message || "Could not create request." : "Network error. Please try again.",
      );
    }
    // QA flagged that the API's `?mine=1` GET sometimes fails to
    // surface a row the venue has just inserted, so they land on a
    // detail page stuck on "Loading…" and a list page that says
    // "No requests yet". Cache the submission locally so the
    // portal stays usable until the API surfaces it. TTL is short
    // (7 days) and the cache merges with API data, deduped by id.
    recordSubmission({
      id: data.id,
      title: payload.title,
      description: payload.description,
      intent: payload.intent,
      styles: payload.styles,
      mediums: payload.mediums,
      budget_min_pence: payload.budgetMinPence ?? null,
      budget_max_pence: payload.budgetMaxPence ?? null,
      location: payload.location ?? null,
      timescale: payload.timescale ?? null,
      visibility: payload.visibility,
      status: "open",
      created_at: new Date().toISOString(),
    });
    router.push(`/venue-portal/artwork-requests/${data.id}`);
  }

  return (
    <VenuePortalLayout activePath="/venue-portal/artwork-requests">
      <div className="max-w-2xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-serif mb-2">New artwork request</h1>
        <p className="text-sm text-muted mb-6">
          Describe what you&rsquo;re looking for. Artists who think they&rsquo;re a fit will reach out.
        </p>
        <p className="text-[11px] text-muted mb-8">
          Fields marked <span className="text-red-500">*</span> are required.
        </p>
        <ArtworkRequestForm mode="create" onSubmit={submit} onCancel={() => router.back()} />
      </div>
    </VenuePortalLayout>
  );
}
