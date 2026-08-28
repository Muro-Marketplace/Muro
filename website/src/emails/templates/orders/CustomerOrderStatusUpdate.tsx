// Stream: tx. A status change the purpose-built lifecycle templates do not cover
// (cancelled, disputed, refunded).
//
// K1: notifyBuyerStatusUpdate handled every status with one hand-written HTML
// body. The Phase 2.3 J1 audit moved shipped/delivered/processing onto their own
// templates and kept the legacy helper alive "only for statuses the dispatcher
// doesn't cover", which is why deleting lib/email.ts needed this. It stays
// deliberately generic: a bespoke template per remaining status would be four
// files nobody maintains.

import { EmailShell, H1, P, Button, InfoBox, SupportBlock } from "@/emails/_components";
import type { TemplateEntry } from "@/emails/registry-types";

export interface CustomerOrderStatusUpdateProps {
  firstName: string;
  orderNumber: string;
  /** Reads as a verb phrase, e.g. "has been cancelled". */
  statusText: string;
  trackingNumber?: string;
  orderUrl: string;
  supportUrl?: string;
}

export function CustomerOrderStatusUpdate({
  firstName,
  orderNumber,
  statusText,
  trackingNumber,
  orderUrl,
  supportUrl,
}: CustomerOrderStatusUpdateProps) {
  return (
    <EmailShell stream="tx" persona="customer" preview={`Order ${orderNumber} ${statusText}`}>
      <H1>Update on order {orderNumber}</H1>
      <P>
        Hi {firstName}, your order {orderNumber} {statusText}.
      </P>
      {trackingNumber && (
        <InfoBox tone="neutral">
          <strong>Tracking number:</strong> {trackingNumber}
        </InfoBox>
      )}
      <Button href={orderUrl} persona="customer">Track your order</Button>
      <SupportBlock supportUrl={supportUrl} />
    </EmailShell>
  );
}

/** The verb phrase for a status. Exported so the caller and the mock agree. */
export function orderStatusText(status: string): string {
  const labels: Record<string, string> = {
    processing: "is being prepared",
    shipped: "has been shipped",
    delivered: "has been delivered",
    cancelled: "has been cancelled",
    refunded: "has been refunded",
    partially_refunded: "has been partially refunded",
    disputed: "is under review after a dispute was raised",
  };
  return labels[status] || `is now marked "${status}"`;
}

export const mock: CustomerOrderStatusUpdateProps = {
  firstName: "Sam",
  orderNumber: "WP-4821",
  statusText: orderStatusText("cancelled"),
  orderUrl: "https://wallplace.co.uk/customer-portal",
  supportUrl: "https://wallplace.co.uk/support",
};

const entry: TemplateEntry<CustomerOrderStatusUpdateProps> = {
  id: "customer_order_status_update",
  name: "Order status update (to customer)",
  description:
    "Generic status change for the statuses without a purpose-built template: cancelled, refunded, disputed.",
  stream: "tx",
  persona: "customer",
  category: "orders_and_payouts",
  subject: "Update on order {{orderNumber}}",
  previewText: "Your order status has changed.",
  component: CustomerOrderStatusUpdate,
  mock,
  canUnsubscribe: false,
  hasInAppEquivalent: true,
  priority: 1,
};
export default entry;
