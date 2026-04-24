// Realistic mock data for template previews. Stays separate from the real
// data layer so designers can tweak copy here without touching Supabase
// fixtures. Every template also exports its own specific mock from the
// template file — this module holds the reusable entity mocks.

import type {
  Address,
  Artist,
  ChecklistStep,
  Conversation,
  OrderItem,
  Placement,
  Stat,
  TimelineEvent,
  Venue,
  Work,
} from "@/emails/types/emailTypes";

export const SITE = "https://wallplace.co.uk";

// ──────────────────────────────────────────────────────────────────────────
// Entities
// ──────────────────────────────────────────────────────────────────────────

export const mockArtist: Artist = {
  id: "a_maya_chen",
  name: "Maya Chen",
  slug: "maya-chen",
  avatar: `${SITE}/avatars/maya-chen.jpg`,
  location: "Hackney, London",
  primaryMedium: "Photography",
  url: `${SITE}/browse/maya-chen`,
};

export const mockArtistSecondary: Artist = {
  id: "a_james_okafor",
  name: "James Okafor",
  slug: "james-okafor",
  avatar: `${SITE}/avatars/james-okafor.jpg`,
  location: "Bermondsey, London",
  primaryMedium: "Painting",
  url: `${SITE}/browse/james-okafor`,
};

export const mockVenue: Venue = {
  id: "v_the_curzon",
  name: "The Curzon",
  slug: "the-curzon",
  image: `${SITE}/venues/the-curzon/hero.jpg`,
  location: "Soho, London",
  type: "Boutique Cinema",
  url: `${SITE}/venues/the-curzon`,
};

export const mockVenueSecondary: Venue = {
  id: "v_foxglove",
  name: "Foxglove & Co",
  slug: "foxglove-co",
  image: `${SITE}/venues/foxglove-co/hero.jpg`,
  location: "Clerkenwell, London",
  type: "Café",
  url: `${SITE}/venues/foxglove-co`,
};

export const mockWork: Work = {
  id: "w_last_light",
  title: "Last Light on Mare Street",
  artistName: mockArtist.name,
  artistSlug: mockArtist.slug,
  image: `${SITE}/works/last-light-mare-street.jpg`,
  url: `${SITE}/browse/${mockArtist.slug}/last-light-mare-street`,
  priceLabel: "From £180",
  size: "50 × 70 cm",
};

export const mockWorkSecondary: Work = {
  id: "w_flower_seller",
  title: "The Flower Seller",
  artistName: mockArtist.name,
  artistSlug: mockArtist.slug,
  image: `${SITE}/works/flower-seller.jpg`,
  url: `${SITE}/browse/${mockArtist.slug}/flower-seller`,
  priceLabel: "£240",
  size: "70 × 50 cm",
};

export const mockWorkTertiary: Work = {
  id: "w_barbican_study_7",
  title: "Barbican, Study No. 7",
  artistName: mockArtistSecondary.name,
  artistSlug: mockArtistSecondary.slug,
  image: `${SITE}/works/barbican-study-7.jpg`,
  url: `${SITE}/browse/${mockArtistSecondary.slug}/barbican-study-7`,
  priceLabel: "£420",
  size: "A3",
};

export const mockWorks: Work[] = [mockWork, mockWorkSecondary, mockWorkTertiary];

// ──────────────────────────────────────────────────────────────────────────
// Complex mocks
// ──────────────────────────────────────────────────────────────────────────

export const mockAddress: Address = {
  name: "Oliver Grant",
  line1: "42 Calvert Avenue",
  line2: "Flat 3",
  city: "London",
  postcode: "E2 7JP",
  country: "United Kingdom",
};

export const mockOrderItems: OrderItem[] = [
  {
    title: "Last Light on Mare Street",
    artistName: "Maya Chen",
    quantity: 1,
    size: "50 × 70 cm",
    image: mockWork.image,
    lineTotal: { amount: 24000, currency: "GBP" },
  },
  {
    title: "Barbican, Study No. 7",
    artistName: "James Okafor",
    quantity: 1,
    size: "A3",
    image: mockWorkTertiary.image,
    lineTotal: { amount: 42000, currency: "GBP" },
  },
];

export const mockPlacement: Placement = {
  id: "p_2026_04_the_curzon",
  artistName: mockArtist.name,
  venueName: mockVenue.name,
  url: `${SITE}/placements/p_2026_04_the_curzon`,
  workTitles: [mockWork.title, mockWorkSecondary.title],
  status: "active",
  startDate: "2026-05-01",
  endDate: "2026-08-01",
  termsSummary: "Paid loan · £120/mo · 10% rev share on QR sales",
};

export const mockPendingPlacement: Placement = {
  ...mockPlacement,
  id: "p_2026_05_foxglove",
  venueName: mockVenueSecondary.name,
  status: "pending",
  termsSummary: "Revenue share · 15% on QR sales",
};

export const mockChecklist: ChecklistStep[] = [
  { label: "Verify email", done: true },
  { label: "Complete profile", done: true, url: `${SITE}/artist-portal/profile` },
  { label: "Upload your first artwork", done: false, url: `${SITE}/artist-portal/portfolio` },
  { label: "Connect Stripe for payouts", done: false, url: `${SITE}/artist-portal/billing` },
  { label: "Set placement preferences", done: false, url: `${SITE}/artist-portal/profile#preferences` },
];

export const mockTimeline: TimelineEvent[] = [
  { label: "Request sent", date: "1 Apr", state: "done" },
  { label: "Accepted", date: "3 Apr", state: "done" },
  { label: "Scheduled", date: "28 Apr", state: "current" },
  { label: "Installed", state: "upcoming" },
  { label: "Live", state: "upcoming" },
];

export const mockStats: Stat[] = [
  { label: "Profile views", value: 342, deltaPct: 18 },
  { label: "QR scans", value: 57, deltaPct: 32 },
  { label: "New messages", value: 4 },
  { label: "Placement requests", value: 2 },
];

export const mockConversations: Conversation[] = [
  {
    id: "c_curzon_maya",
    otherPartyName: mockVenue.name,
    latestMessage: "We'd love to host the Mare Street series starting May.",
    unreadCount: 2,
    url: `${SITE}/artist-portal/messages?c=c_curzon_maya`,
  },
  {
    id: "c_foxglove_maya",
    otherPartyName: mockVenueSecondary.name,
    latestMessage: "Could you share framed dimensions for the café wall?",
    unreadCount: 1,
    url: `${SITE}/artist-portal/messages?c=c_foxglove_maya`,
  },
];

export const mockSupportUrl = `${SITE}/support`;
export const mockPreferencesUrl = `${SITE}/account/email`;
export const mockUnsubscribeUrl = `${SITE}/account/email/unsubscribe`;

export const mockFirstNames = {
  artist: "Maya",
  venue: "Hannah",
  customer: "Oliver",
};
