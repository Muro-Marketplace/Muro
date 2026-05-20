import type { Metadata } from "next";
import ArtworkRequestsClient from "./ArtworkRequestsClient";

export const metadata: Metadata = {
  title: "Artwork requests",
  description:
    "Venues posting open calls for art. Browse current artwork requests and submit your work to be considered.",
};

export default function ArtworkRequestsPage() {
  return <ArtworkRequestsClient />;
}
