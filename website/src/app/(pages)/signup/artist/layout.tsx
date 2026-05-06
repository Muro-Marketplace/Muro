import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up as an artist",
  description:
    "Apply to join Wallplace's curated artist roster. First month free if accepted.",
};

export default function SignupArtistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
