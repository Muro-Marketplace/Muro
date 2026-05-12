import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spaces looking for art",
  description:
    "Real venues with walls ready for original artwork. Browse open briefs from cafés, offices, hotels and more.",
};

export default function SpacesLookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
