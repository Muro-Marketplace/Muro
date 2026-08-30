import { Suspense } from "react";
import type { Metadata } from "next";
import { CURATION_TIERS, gbp } from "@/lib/curation-tiers";
import CuratedClient from "./CuratedClient";

export const metadata: Metadata = {
  title: "Curated matching, art picked for your venue",
  description: `Wallplace Curated: tell us about your space and our curators hand-pick a shortlist of works from Wallplace artists that fit. From ${gbp(CURATION_TIERS.single_wall.priceGbp)}.`,
};

export default function CuratedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CuratedClient />
    </Suspense>
  );
}
