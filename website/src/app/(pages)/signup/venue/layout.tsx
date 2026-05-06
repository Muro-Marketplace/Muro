import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Register your venue",
  description:
    "Tell us about your space and we'll match you with artists whose work fits. Free to display, no contracts, cancel any time.",
};

export default function SignupVenueLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
