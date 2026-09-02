import type { Metadata } from "next";
import { FOUNDING_OFFER_SHORT } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Sign up as an artist",
  description: `Apply to join Wallplace's curated artist roster. ${FOUNDING_OFFER_SHORT}.`,
};

export default function SignupArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
