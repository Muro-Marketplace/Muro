import type { Metadata } from "next";

// Admin pages are client components and cannot export their own metadata,
// so the section title is set here. Subroutes add their own page title via
// a sibling layout, which slots into this template.
export const metadata: Metadata = {
  title: {
    default: "Admin | Wallplace",
    template: "%s | Admin | Wallplace",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
