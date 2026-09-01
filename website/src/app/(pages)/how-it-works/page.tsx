import type { Metadata } from "next";
import HowItWorksClient from "./HowItWorksClient";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Wallplace works for venues, artists, and buyers. A curated marketplace for original artwork, seen on real walls.",
};

export default function HowItWorksPage() {
  return <HowItWorksClient />;
}
