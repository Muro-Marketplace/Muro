"use client";

import VenuePortalLayout from "@/components/VenuePortalLayout";

type OrderStatus = "Delivered" | "In Transit" | "Processing";

interface Order {
  id: string;
  artist: string;
  title: string;
  type: "Purchase" | "Loan";
  amount: string;
  status: OrderStatus;
  date: string;
}

// TODO: Replace with Supabase query for the logged-in venue's orders
const orders: Order[] = [];

const statusBadge = (status: OrderStatus) => {
  const styles: Record<OrderStatus, string> = {
    Delivered: "bg-green-50 text-green-700 border-green-200",
    "In Transit": "bg-blue-50 text-blue-700 border-blue-200",
    Processing: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-medium border rounded-full ${styles[status]}`}
    >
      {status}
    </span>
  );
};

export default function OrdersPage() {
  return (
    <VenuePortalLayout>
      <div className="mb-6">
        <h1 className="font-serif text-2xl lg:text-3xl text-foreground mb-1">
          My Orders
        </h1>
        <p className="text-sm text-muted">
          Track your purchases and active loan arrangements.
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-white border border-border rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Order #
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Artist
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Artwork
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Type
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Amount
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Status
              </th>
              <th className="text-left px-5 py-3 text-xs font-medium text-muted uppercase tracking-wide">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => (
              <tr
                key={order.id}
                className="hover:bg-background/50 transition-colors"
              >
                <td className="px-5 py-4 font-mono text-xs text-muted">
                  #{order.id}
                </td>
                <td className="px-5 py-4 font-medium text-foreground whitespace-nowrap">
                  {order.artist}
                </td>
                <td className="px-5 py-4 text-muted max-w-xs">
                  <span className="line-clamp-1">{order.title}</span>
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-sm border ${
                      order.type === "Purchase"
                        ? "bg-accent/5 border-accent/20 text-accent"
                        : "bg-background border-border text-foreground/70"
                    }`}
                  >
                    {order.type}
                  </span>
                </td>
                <td className="px-5 py-4 text-foreground whitespace-nowrap font-medium">
                  {order.amount}
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  {statusBadge(order.status)}
                </td>
                <td className="px-5 py-4 text-muted whitespace-nowrap">
                  {order.date}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile list */}
      <div className="lg:hidden space-y-3">
        {orders.map((order) => (
          <div
            key={order.id}
            className="bg-white border border-border rounded-sm p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-xs text-muted">
                    #{order.id}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-sm border ${
                      order.type === "Purchase"
                        ? "bg-accent/5 border-accent/20 text-accent"
                        : "bg-background border-border text-foreground/70"
                    }`}
                  >
                    {order.type}
                  </span>
                </div>
                <p className="font-medium text-sm text-foreground">
                  {order.title}
                </p>
                <p className="text-xs text-muted">{order.artist}</p>
              </div>
              {statusBadge(order.status)}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-sm font-medium text-foreground">
                {order.amount}
              </span>
              <span className="text-xs text-muted">{order.date}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-white border border-border rounded-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Total spend to date</span>
          <span className="font-medium text-foreground">£800</span>
        </div>
        <div className="flex items-center justify-between text-sm mt-2">
          <span className="text-muted">Active loan arrangements</span>
          <span className="font-medium text-foreground">2</span>
        </div>
      </div>
    </VenuePortalLayout>
  );
}
