import { redirect } from "next/navigation";

// C4/C18: refund and order emails, the refund-approved bell notification and
// the /orders/[id] back-link all deep-linked to /customer-portal/orders, which
// never existed as a route (the customer's orders live on the /customer-portal
// dashboard itself), so every one of those links 404ed. The link writers now
// point at /customer-portal directly; this redirect rescues the links already
// sitting in inboxes and the bell drawer.
//
// Legacy bell notifications carried ?id=<orderId> while the dashboard reads
// ?order= (useUrlState("order")), so map that across too. Everything else in
// the query string is preserved as-is.
export default async function CustomerPortalOrdersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else if (value !== undefined) {
      qs.append(key, value);
    }
  }
  const legacyId = qs.get("id");
  if (legacyId && !qs.has("order")) {
    qs.delete("id");
    qs.set("order", legacyId);
  }
  const query = qs.toString();
  redirect(query ? `/customer-portal?${query}` : "/customer-portal");
}
