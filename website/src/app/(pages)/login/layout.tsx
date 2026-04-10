import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login – Wallspace",
  description: "Log in to your Wallspace account as an artist or venue.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
