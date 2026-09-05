"use client";

import CustomerPortalLayout from "@/components/CustomerPortalLayout";

/**
 * The customer portal's chrome mounts HERE, once, not inside each of the 5
 * pages. See artist-portal/layout.tsx for why.
 *
 * This route had no layout.tsx at all, so PortalGuard was mounted by the pages
 * too (CustomerPortalLayout wraps the shell in it), which meant the auth gate
 * itself was rebuilt on every click alongside the sidebar. Both are above the
 * page now.
 *
 * No full-bleed exception here: /customer-portal/orders is a server-side
 * redirect to the dashboard and renders nothing.
 */
export default function CustomerPortalRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CustomerPortalLayout>{children}</CustomerPortalLayout>;
}
