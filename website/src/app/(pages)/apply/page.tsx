import type { Metadata } from "next";
import ApplyClient from "./ApplyClient";
import { FOUNDING_OFFER_SHORT } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Apply to join",
  description: `Apply to join Wallplace, the curated platform connecting artists with independent venues. ${FOUNDING_OFFER_SHORT}.`,
};

export default function ApplyPage() {
  return <ApplyClient />;
}
