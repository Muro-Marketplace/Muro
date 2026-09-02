import type { Metadata } from "next";
import { Suspense } from "react";
import HowItWorksClient from "./HowItWorksClient";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Wallplace works for venues, artists, and buyers. A curated marketplace for original artwork, seen on real walls.",
};

export default function HowItWorksPage() {
  // HowItWorksClient reads ?tab= with useSearchParams, which must sit
  // under a Suspense boundary so the rest of the page can still prerender.
  return (
    <Suspense fallback={null}>
      <HowItWorksClient />
    </Suspense>
  );
}
