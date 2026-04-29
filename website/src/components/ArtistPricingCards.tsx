"use client";

import { useState } from "react";
import Button from "@/components/Button";

interface Plan {
  key: "core" | "premium" | "pro";
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  fee: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}

const PLANS: Plan[] = [
  {
    key: "core",
    name: "Core",
    priceMonthly: 9.99,
    priceAnnual: 99.99,
    fee: "15% platform fee on sales",
    features: [
      "Up to 8 works in your portfolio",
      "Standard artist profile",
      "Message venues directly",
      "Visibility to venues browsing the platform",
      "Curated matching",
      "Basic analytics dashboard",
    ],
  },
  {
    key: "premium",
    name: "Premium",
    priceMonthly: 24.99,
    priceAnnual: 249.99,
    fee: "8% platform fee on sales",
    highlighted: true,
    badge: "Most Popular",
    features: [
      "Up to 20 works in your portfolio",
      "Featured artist profile + badge",
      "Priority visibility in venue recommendations",
      "Message venues directly",
      "Full analytics, views, enquiries, conversion",
      "Priority response from Wallplace team",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 49.99,
    priceAnnual: 499.99,
    fee: "5% platform fee on sales",
    features: [
      "Unlimited works in your portfolio",
      "Premium profile with enhanced presentation",
      "Maximum visibility across the platform",
      "Message venues directly",
      "Full analytics + venue breakdown + export",
      "Dedicated account support",
    ],
  },
];

interface Props {
  ctaHref?: string;
  ctaLabel?: string;
  showSavingsCopy?: boolean;
}

export default function ArtistPricingCards({
  ctaHref = "/apply",
  ctaLabel = "Apply to Join",
  showSavingsCopy = true,
}: Props) {
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  return (
    <div>
      {/* Billing toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center gap-0.5 p-0.5 bg-surface border border-border rounded-sm text-sm">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`px-4 py-2 rounded-sm transition-colors ${
              cycle === "monthly" ? "bg-foreground text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setCycle("annual")}
            className={`px-4 py-2 rounded-sm transition-colors inline-flex items-center gap-2 ${
              cycle === "annual" ? "bg-foreground text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Annual
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium ${
              cycle === "annual" ? "bg-white/15 text-white" : "bg-accent/10 text-accent"
            }`}>
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isAnnual = cycle === "annual";
          const price = isAnnual ? plan.priceAnnual : plan.priceMonthly;
          const suffix = isAnnual ? "/year" : "/month";
          const monthlyEq = isAnnual ? `\u00a3${(plan.priceAnnual / 12).toFixed(2)}/mo equivalent` : null;
          const containerCls = plan.highlighted
            ? "bg-surface border-2 border-accent rounded-sm p-8 flex flex-col relative"
            : "bg-surface border border-border rounded-sm p-8 flex flex-col";

          // On annual we show the monthly-equivalent as the prominent number
          // (Claude.ai style) with "billed annually as £X" underneath, plus a
          // "save 17%" chip. On monthly the big number is just the monthly
          // price. Prevents the "£119.88" sticker shock while making the
          // annual discount obvious.
          const primaryAmount = isAnnual
            ? `\u00a3${(plan.priceAnnual / 12).toFixed(2)}`
            : `\u00a3${plan.priceMonthly}`;
          const secondaryLine = isAnnual
            ? `\u00a3${plan.priceAnnual.toFixed(2)} billed annually`
            : "billed monthly";

          return (
            <div key={plan.key} className={containerCls}>
              {plan.badge && (
                <div className="absolute -top-3 left-6 bg-accent text-white text-xs font-medium px-3 py-1 rounded-sm">
                  {plan.badge}
                </div>
              )}
              <h3 className="text-2xl mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-4xl font-serif">{primaryAmount}</span>
                <span className="text-muted text-sm">/mo</span>
                {isAnnual && (
                  <span className="text-[10px] uppercase tracking-widest font-medium px-1.5 py-0.5 bg-accent/10 text-accent rounded-sm">Save 17%</span>
                )}
              </div>
              <p className="text-xs text-muted mb-1">{secondaryLine}</p>
              <p className="text-sm text-muted mb-1">First month free</p>
              <p className="text-sm font-medium text-foreground mb-6">{plan.fee}</p>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent mt-0.5 shrink-0">
                      <path d="M3 8.5l3.5 3.5L13 4" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <Button href={ctaHref} variant={plan.highlighted ? "primary" : "secondary"} size="md">
                {ctaLabel}
              </Button>
            </div>
          );
        })}
      </div>

      {showSavingsCopy && (
        <p className="text-xs text-muted text-center mt-5">
          Annual plans include two months free (save ~17%). Cancel anytime.
        </p>
      )}
    </div>
  );
}
