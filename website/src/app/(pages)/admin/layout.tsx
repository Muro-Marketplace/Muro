import type { Metadata } from "next";
import AdminGate from "@/components/AdminGate";

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

// E30b. This returned its children unwrapped, so nothing ran server-side ahead
// of the /admin route group and the only gate was a render-time check inside
// AdminPortalLayout against a field the user writes themselves. Wrapping here,
// at the route-group boundary, means every current and future admin page is
// covered without each one remembering to opt in, which is the failure mode
// that made the original hole reachable.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>;
}
