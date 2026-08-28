// The four kinds of enquiry someone can send an artist, in one place.
//
// Found during the 07 §3.2 label sweep. `venue-portal/enquiries` typed the field
// as `"Paid Loan" | "Revenue Share" | "Purchase" | "Display"` — the ARRANGEMENT
// vocabulary, which this is not — and then assigned `e.enquiry_type` straight
// into it. The real column holds `venue_looking`, `purchasing`, `custom_piece`
// and `general`, so the type was fiction and TypeScript could not say so,
// because the assignment was through a cast.
//
// The visible consequence: the venue portal rendered the raw value. On the 11
// enquiries in production that is a badge reading "venue_looking".
//
// The labels already existed, as the option text in the artist profile's enquiry
// form. They live here now, so the form and the badge cannot drift.

export const ENQUIRY_TYPES = [
  { value: "venue_looking", label: "Looking for art", option: "I'm a venue looking for art" },
  { value: "purchasing", label: "Purchase enquiry", option: "I'm interested in purchasing" },
  { value: "custom_piece", label: "Custom piece", option: "Request a custom piece" },
  { value: "general", label: "General question", option: "General question" },
] as const;

export type EnquiryType = (typeof ENQUIRY_TYPES)[number]["value"];

const BY_VALUE = new Map<string, string>(ENQUIRY_TYPES.map((t) => [t.value, t.label]));

/**
 * The label for a stored `enquiry_type`.
 *
 * An unrecognised value is title-cased from its own slug rather than replaced
 * with "Other": legacy rows and any future value still read as something, and
 * the person looking at the badge can see what was actually stored.
 */
export function enquiryTypeLabel(value: string | null | undefined): string {
  const key = (value ?? "").trim().toLowerCase();
  if (!key) return "Enquiry";
  const known = BY_VALUE.get(key);
  if (known) return known;
  return key
    .replace(/[_-]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
