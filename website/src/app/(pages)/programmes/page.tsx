import type { Metadata } from "next";
import { CURATION_TIERS, gbp } from "@/lib/curation-tiers";
import ProgrammesClient from "./ProgrammesClient";

export const metadata: Metadata = {
  title: "Programmes for offices, hotels and restaurants",
  description: `Original art for offices, hotels and restaurants. Curated, installed and rotated through the year, with rent paid to every artist on the wall. From ${gbp(CURATION_TIERS.programme.priceGbp)} per site per month.`,
};

export default function ProgrammesPage() {
  return <ProgrammesClient />;
}
