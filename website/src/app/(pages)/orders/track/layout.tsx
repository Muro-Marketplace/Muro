import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track an order",
  description:
    "Track your Wallplace order with the order ID and email from your receipt. No account required.",
};

export default function OrdersTrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
