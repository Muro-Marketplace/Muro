import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
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

  let state: "ok" | "critical" | "missing" | "unknown" = "missing";
  if (!u || !category) {
    state = "missing";
  } else if (!preferenceKeyFor(category)) {
    state = "critical";
  } else {
    try {
      const db = getSupabaseAdmin();
      const key = preferenceKeyFor(category)!;
      const { error } = await db
        .from("email_preferences")
        .upsert(
          { user_id: u, [key]: false, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      state = error ? "unknown" : "ok";
    } catch {
      state = "unknown";
    }
  }

  return (
    <div className="bg-background">
      <section className="py-20 lg:py-24">
        <div className="max-w-[640px] mx-auto px-6">
          <h1 className="text-3xl lg:text-4xl mb-4">Email preferences</h1>

          {state === "ok" && (
            <p className="text-muted leading-relaxed mb-6">
              You&rsquo;ve been unsubscribed from {label?.toLowerCase()}. We won&rsquo;t send you any more of those emails. Critical messages about orders, security, and legal notices will still come through, you can&rsquo;t turn those off.
            </p>
          )}
          {state === "critical" && (
            <p className="text-muted leading-relaxed mb-6">
              {label} are required for service and can&rsquo;t be turned off. If you no longer want to receive any email from Wallplace, you can{" "}
              <Link href="/account/delete" className="text-accent hover:underline">delete your account</Link>
              .
            </p>
          )}
          {state === "missing" && (
            <p className="text-muted leading-relaxed mb-6">
              We couldn&rsquo;t read the unsubscribe details from the link. Please use the link in the email, or sign in to update your preferences directly.
            </p>
          )}
          {state === "unknown" && (
            <p className="text-muted leading-relaxed mb-6">
              Something went wrong saving your preference. Please try again from the link in the email, or contact{" "}
              <a href="mailto:hello@wallplace.co.uk" className="text-accent hover:underline">hello@wallplace.co.uk</a>
              .
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
