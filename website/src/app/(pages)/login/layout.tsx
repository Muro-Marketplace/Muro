import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login",
  description: "Log in to your Wallplace account as an artist or venue.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
