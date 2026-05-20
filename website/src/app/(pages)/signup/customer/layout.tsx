import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a buyer account",
  description:
    "Sign up to buy original artwork directly from independent artists on Wallplace, and track your orders in one place.",
};

export default function SignupCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
