import { Suspense } from "react";
import type { Metadata } from "next";
import { CURATION_TIERS, gbp } from "@/lib/curation-tiers";
import CuratedClient from "./CuratedClient";

export const metadata: Metadata = {
  title: "Manage My Walls: curated shortlists and ongoing programmes",
  description: `Two ways to get art on your walls without doing it yourself. Wallplace Curated: a one-off hand-picked shortlist from ${gbp(CURATION_TIERS.single_wall.priceGbp)}. Wallplace Programmes: an ongoing service from ${gbp(CURATION_TIERS.programme.priceGbp)} a month.`,
};

export default function CuratedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CuratedClient />
    </Suspense>
  );
}
