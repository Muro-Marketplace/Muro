import type { Metadata } from "next";
import Link from "next/link";
import ConfirmUnsubscribe from "./ConfirmUnsubscribe";
import { preferenceKeyFor, type EmailCategory } from "@/lib/email/categories";

export const metadata: Metadata = {
  title: "Unsubscribed",
  description: "Update your Wallplace email preferences.",
  robots: { index: false, follow: false },
};

const VALID_CATEGORIES: EmailCategory[] = [
  "security",
  "legal",
  "orders_and_payouts",
  "placements",
  "messages",
  "digests",
  "recommendations",
  "tips",
  "newsletter",
  "promotions",
];

const CATEGORY_LABELS: Record<EmailCategory, string> = {
  security: "Security alerts",
  legal: "Legal notices",
  orders_and_payouts: "Order and payout updates",
  placements: "Placement updates",
  messages: "New message alerts",
  digests: "Weekly digests",
  recommendations: "Recommendations",
  tips: "Tips and product updates",
  newsletter: "Newsletter",
  promotions: "Offers and promotions",
  // K1: internal operational alerts to the Wallplace team. Listed so this map
  // stays exhaustive over EmailCategory (that exhaustiveness is what surfaced
  // the omission at compile time), but never shown: it is not in the
  // TOGGLEABLE list above, because no user is its recipient.
  platform_admin: "Internal platform alerts",
};

interface SearchParams {
  c?: string;
  u?: string;
}

// Server component so we can apply the unsubscribe and read back the
// result in one round-trip; the email link is the trust boundary, so
// no session is required. Mirrors the POST handler at /api/account/
// email/unsubscribe (which mail clients hit for RFC 8058 one-click).
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { c, u } = await searchParams;
  const category = c && VALID_CATEGORIES.includes(c as EmailCategory) ? (c as EmailCategory) : null;
  const label = category ? CATEGORY_LABELS[category] : null;

  // QA flag C24: the preference is no longer changed during this render.
  // Applying on GET meant a mail client's link prefetch unsubscribed the
  // reader without a click; the ConfirmUnsubscribe button now owns the write.
  const state: "confirm" | "critical" | "missing" =
    !u || !category ? "missing" : !preferenceKeyFor(category) ? "critical" : "confirm";

  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[640px] mx-auto px-6">
          <h1 className="text-3xl lg:text-4xl mb-4">Email preferences</h1>

          {state === "confirm" && (
            <ConfirmUnsubscribe userId={u!} category={category!} label={label || "these emails"} />
          )}
          {state === "critical" && (
            <p className="text-muted leading-relaxed mb-6">
              {label} are required for service and can&rsquo;t be turned off. If you no longer want to receive any email from Wallplace, you can{" "}
              <Link href="/customer-portal/settings" className="text-accent hover:underline">delete your account from your settings page</Link>
              .
            </p>
          )}
          {state === "missing" && (
            <p className="text-muted leading-relaxed mb-6">
              We couldn&rsquo;t read the unsubscribe details from the link. Please use the link in the email, or sign in to update your preferences directly.
            </p>
          )}

          <div className="border-t border-border pt-6 mt-6">
            <p className="text-sm text-muted leading-relaxed">
              Want to change your full preference set? Sign in and visit{" "}
              <Link href="/account/email" className="text-accent hover:underline">your email preferences</Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
