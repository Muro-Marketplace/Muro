/**
 * Legal identity, filled in once incorporation completes (owner action A1 in
 * docs/superpowers/plans/2026-09-02-launch-readiness.md). While `number` is
 * blank the agreements and terms show the pre-incorporation note; once it is
 * set they show the registered details. One place, so the legal pages and the
 * footer cannot disagree.
 */
export const COMPANY = {
  tradingName: "Wallplace",
  legalName: "",
  number: "",
  registeredOffice: "",
};

export function isIncorporated(): boolean {
  return COMPANY.number.trim().length > 0;
}

/**
 * The name to print where a legal entity is named (the privacy policy, the
 * email footer). The registered company once incorporated, the trading name
 * until then, so no page can claim a limited company that does not yet exist.
 */
export function legalEntityName(): string {
  return isIncorporated() ? COMPANY.legalName : COMPANY.tradingName;
}
