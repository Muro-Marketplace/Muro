import type { Metadata } from "next";
import HowItWorksClient from "./HowItWorksClient";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Wallplace works for venues, artists, and buyers — a curated marketplace for original artwork in commercial spaces.",
};

export default function HowItWorksPage() {
  return <HowItWorksClient />;
}
