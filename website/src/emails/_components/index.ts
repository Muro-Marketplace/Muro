// Single import surface for every email template.
// Templates should import from "@/emails/_components" and never reach into
// individual files — keeps downstream refactors painless.

export { EmailShell } from "./EmailShell";
export { theme, accentFor, siteUrl, companyDetails } from "./theme";
export { Button, SecondaryButton, TextLink } from "./Button";
export { H1, H2, P, Small } from "./Paragraph";
export { Badge } from "./Badge";
export { InfoBox, WarningBox } from "./InfoBox";
export { Hero } from "./Hero";
export { StatBlock } from "./StatBlock";
export { WorkCard, ArtistCard, VenueCard, PlacementCard } from "./Cards";
export { OrderSummary } from "./OrderSummary";
export { PayoutSummary } from "./PayoutSummary";
export { Checklist } from "./Checklist";
export { Timeline } from "./Timeline";
export { MessagePreview } from "./MessagePreview";
export { QRScanSummary } from "./QRScanSummary";
export { QuoteBlock } from "./QuoteBlock";
export { AddressBlock } from "./AddressBlock";
export { SupportBlock } from "./SupportBlock";
export { SocialLinks } from "./SocialLinks";
export { Divider } from "./Divider";
