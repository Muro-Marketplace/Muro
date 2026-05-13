import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout",
  // Checkout pages shouldn't be indexed, the URL doesn't carry any
  // shareable content and search engines have no business crawling
  // a half-filled basket.
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
