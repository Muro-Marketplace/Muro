// Waitlist (#18), kept live for warm prospects who already have the
// link, but unsurfaced from the nav and excluded from search. Layout
// owns the metadata because page.tsx is a client component and can't
// export `metadata` directly.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Waitlist",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return children;
}
