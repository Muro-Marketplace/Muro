// Phase 2 chunk 2.0c. Single source of truth for the public-facing
// strings the new lifecycle templates share. The values here are the
// standard UK consumer-rights copy that has to appear on order-related
// transactional emails. Keeping them in one file means a change to the
// returns window or support address is a one-line edit, not a sweep
// across six templates.

import { companyDetails } from "@/emails/_components/theme";

export const SUPPORT_EMAIL = companyDetails.supportEmail;
export const SUPPORT_URL = "https://wallplace.co.uk/contact";
export const RETURNS_URL = "https://wallplace.co.uk/returns";
export const PRIVACY_URL = "https://wallplace.co.uk/privacy";
export const COMPANY_NAME = companyDetails.name;
export const COMPANY_ADDRESS = companyDetails.address;

// Statutory return window for distance-selling consumer goods under the
// UK Consumer Contracts Regulations 2013. Surfaced verbatim in every
// customer-facing order email.
export const RETURN_WINDOW_DAYS = 14;

export const CONSUMER_RIGHTS_FOOTER = [
  `Under the UK Consumer Contracts Regulations 2013 you have ${RETURN_WINDOW_DAYS} days from receipt to cancel and return your order. Custom or commissioned pieces are excluded once production has started.`,
  `Questions or problems? Email ${SUPPORT_EMAIL} or visit ${SUPPORT_URL}.`,
  `${COMPANY_NAME}, ${COMPANY_ADDRESS}. We process your data under our privacy policy at ${PRIVACY_URL}.`,
].join(" ");
