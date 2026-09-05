import type { Metadata } from "next";
import AdminGate from "@/components/AdminGate";
import AdminPortalLayout from "@/components/AdminPortalLayout";

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
// The admin chrome mounts HERE, once, not inside each of the 12 pages. See
// artist-portal/layout.tsx for why: App Router swaps the page element on
// navigation, so chrome rendered under the page is destroyed and rebuilt on
// every click, which reset adminState to "checking", put the full-screen
// "Loading admin portal..." panel over the whole viewport and re-ran
// GET /api/admin/whoami. The per-section layouts below this one only carry
// metadata and pass children through, so they compose unchanged.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGate>
      <AdminPortalLayout>{children}</AdminPortalLayout>
    </AdminGate>
  );
}
