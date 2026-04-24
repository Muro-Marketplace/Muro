import { Row, Column, Img, Text, Link } from "@react-email/components";
import type { Artist, Placement, Venue, Work } from "@/emails/types/emailTypes";
import { theme } from "./theme";
import { Badge } from "./Badge";

// Shared card chrome. Rendered as a table so Outlook plays ball.
const cardBase = {
  backgroundColor: theme.surface,
  border: `1px solid ${theme.border}`,
  borderRadius: 3,
  margin: "12px 0",
  padding: 0,
} as const;

const titleStyle = {
  fontFamily: theme.serifStack,
  fontSize: 16,
  color: theme.foreground,
  margin: "0 0 4px",
} as const;

const metaStyle = {
  fontSize: 12,
  color: theme.muted,
  margin: 0,
  letterSpacing: "0.02em",
} as const;

export function WorkCard({ work }: { work: Work }) {
  return (
    <Row style={cardBase}>
      <Column style={{ width: 96, padding: 0, verticalAlign: "top" }}>
        <Img
          src={work.image}
          alt={work.title}
          width={96}
          height={96}
          style={{ display: "block", width: 96, height: 96, objectFit: "cover" as const }}
        />
      </Column>
      <Column style={{ padding: "12px 16px", verticalAlign: "top" }}>
        <Text style={titleStyle}>
          <Link href={work.url} style={{ color: theme.foreground, textDecoration: "none" }}>
            {work.title}
          </Link>
        </Text>
        <Text style={metaStyle}>
          {work.artistName}
          {work.size ? ` · ${work.size}` : ""}
          {work.priceLabel ? ` · ${work.priceLabel}` : ""}
        </Text>
      </Column>
    </Row>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Row style={cardBase}>
      <Column style={{ width: 72, padding: 0, verticalAlign: "top" }}>
        <Img
          src={artist.avatar}
          alt={artist.name}
          width={72}
          height={72}
          style={{ display: "block", width: 72, height: 72, objectFit: "cover" as const }}
        />
      </Column>
      <Column style={{ padding: "12px 16px", verticalAlign: "top" }}>
        <Text style={titleStyle}>
          <Link href={artist.url} style={{ color: theme.foreground, textDecoration: "none" }}>
            {artist.name}
          </Link>
        </Text>
        <Text style={metaStyle}>
          {artist.primaryMedium} · {artist.location}
        </Text>
      </Column>
    </Row>
  );
}

export function VenueCard({ venue }: { venue: Venue }) {
  return (
    <Row style={cardBase}>
      <Column style={{ width: 110, padding: 0, verticalAlign: "top" }}>
        <Img
          src={venue.image}
          alt={venue.name}
          width={110}
          height={84}
          style={{ display: "block", width: 110, height: 84, objectFit: "cover" as const }}
        />
      </Column>
      <Column style={{ padding: "12px 16px", verticalAlign: "top" }}>
        <Text style={titleStyle}>
          <Link href={venue.url} style={{ color: theme.foreground, textDecoration: "none" }}>
            {venue.name}
          </Link>
        </Text>
        <Text style={metaStyle}>
          {venue.type} · {venue.location}
        </Text>
      </Column>
    </Row>
  );
}

export function PlacementCard({ placement }: { placement: Placement }) {
  const tone =
    placement.status === "active"    ? "success" :
    placement.status === "pending"   ? "warning" :
    placement.status === "declined"  ? "danger"  :
    placement.status === "cancelled" ? "danger"  : "neutral";

  return (
    <Row style={cardBase}>
      <Column style={{ padding: "14px 16px" }}>
        <Text style={{ ...metaStyle, marginBottom: 6 }}>
          <Badge tone={tone}>{placement.status.toUpperCase()}</Badge>
        </Text>
        <Text style={titleStyle}>
          <Link href={placement.url} style={{ color: theme.foreground, textDecoration: "none" }}>
            {placement.artistName} × {placement.venueName}
          </Link>
        </Text>
        <Text style={metaStyle}>{placement.termsSummary}</Text>
        {(placement.startDate || placement.endDate) && (
          <Text style={{ ...metaStyle, marginTop: 4 }}>
            {placement.startDate ? `From ${placement.startDate}` : ""}
            {placement.startDate && placement.endDate ? " · " : ""}
            {placement.endDate ? `Until ${placement.endDate}` : ""}
          </Text>
        )}
        {placement.workTitles.length > 0 && (
          <Text style={{ ...metaStyle, marginTop: 4 }}>
            {placement.workTitles.length === 1 ? placement.workTitles[0] : `${placement.workTitles.length} works`}
          </Text>
        )}
      </Column>
    </Row>
  );
}
