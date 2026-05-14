import Link from "next/link";

export interface EmptyStateProps {
  /** One-line summary, e.g. "No orders yet". */
  title: string;
  /** Sentence explaining why and what to do next. */
  hint: string;
  /** Optional next-step button. */
  cta?: { label: string; href: string };
  /** Optional secondary link rendered beneath the primary CTA. */
  secondaryCta?: { label: string; href: string };
  /** Optional small icon slot, rendered above the title. */
  icon?: React.ReactNode;
}

/**
 * Standardised empty state for list views. Always pairs an explanation
 * with a clear next action. Don't use for "loading" — use a skeleton.
 */
export default function EmptyState({ title, hint, cta, secondaryCta, icon }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-6">
      {icon && <div className="text-muted/50 mb-3 flex justify-center">{icon}</div>}
      <h3 className="text-base font-medium text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto mb-6">{hint}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
        >
          {cta.label}
        </Link>
      )}
      {secondaryCta && (
        <div className="mt-3">
          <Link
            href={secondaryCta.href}
            className="text-sm text-muted hover:text-foreground underline underline-offset-2"
          >
            {secondaryCta.label}
          </Link>
        </div>
      )}
    </div>
  );
}
