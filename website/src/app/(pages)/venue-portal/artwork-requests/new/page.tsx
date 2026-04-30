"use client";

// Venue creates a new artwork request. The form itself lives in
// `ArtworkRequestForm` so the edit route can render an identical UI;
// this page just wires the POST callback + redirect.

import { useRouter } from "next/navigation";
import VenuePortalLayout from "@/components/VenuePortalLayout";
import { authFetch } from "@/lib/api-client";
import ArtworkRequestForm, { type ArtworkRequestPayload } from "@/components/artwork-requests/ArtworkRequestForm";

export default function NewArtworkRequestPage() {
  const router = useRouter();

  async function submit(payload: ArtworkRequestPayload) {
    const res = await authFetch("/api/artwork-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || "Could not create request.");
    }
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
