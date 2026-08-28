// Artwork requests are PARKED (owner decision 2026-08-28): the feature was
// judged overkill for the MVP and returns in its own PR later. The API routes,
// components and data stay in place, dormant; only the surfaces are gone.
import { redirect } from "next/navigation";

export default function ParkedArtworkRequests() {
  redirect("/spaces");
}
