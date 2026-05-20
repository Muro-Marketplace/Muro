import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse artists",
  description:
    "Discover original artwork from curated independent artists across the UK. Filter by style, location, and price.",
};

export default function BrowseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
