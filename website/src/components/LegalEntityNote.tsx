import { COMPANY, isIncorporated } from "@/lib/company";

/**
 * The identity block at the top of each agreement and the terms page.
 *
 * `children`, if given, renders as one more sentence in the same paragraph:
 * between the two pre-incorporation sentences before the company is
 * registered, and after the registered details once it is. It exists for
 * the terms page, which carries an extra sentence ("References to
 * Wallplace throughout this document refer to the business operating
 * under this trading name.") that the artist and venue agreements don't;
 * that sentence is page-specific, so it stays out of the shared identity
 * copy rather than living inside it.
 */
export default function LegalEntityNote({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-sm p-5 mb-16">
      <p className="text-sm text-muted leading-relaxed">
        {isIncorporated() ? (
          <>
            <strong className="text-foreground">{COMPANY.tradingName}</strong> is the trading name of {COMPANY.legalName}, a company registered in England and Wales (company number {COMPANY.number}), registered office {COMPANY.registeredOffice}.
            {children ? <> {children}</> : null}
          </>
        ) : (
          <>
            <strong className="text-foreground">Note:</strong> Wallplace is the trading name of a business in the process of being incorporated as a limited company in England and Wales.{children ? <> {children}</> : null} Once incorporated, this document will be updated to reflect the registered company name and number.
          </>
        )}
      </p>
    </div>
  );
}
