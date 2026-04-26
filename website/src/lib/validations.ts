import { z } from "zod";

// Shared helpers
const safeString = (max = 500) => z.string().trim().min(1).max(max);
const email = z.string().trim().email().max(254);
// Accepts string / "" / undefined / null. Null is coerced to "" so callers
// can safely serialise missing values as `null` (common when loading from
// Postgres) without tripping the validator.
const optionalString = (max = 500) =>
  z.preprocess(
    (v) => (v === null ? "" : v),
    z.string().trim().max(max).optional().or(z.literal("")),
  );

// Public forms
export const waitlistSchema = z.object({
  name: safeString(100),
  email,
  userType: z.enum(["artist", "venue", "both"]),
});

export const contactSchema = z.object({
  name: safeString(100),
  email,
  type: safeString(50),
  message: safeString(2000),
});

export const enquirySchema = z.object({
  senderName: safeString(100),
  senderEmail: email,
  artistSlug: safeString(100),
  workTitle: optionalString(200),
  enquiryType: safeString(50),
  message: safeString(2000),
});

export const applySchema = z.object({
  name: safeString(100),
  email,
  location: safeString(200),
  instagram: optionalString(200),
  website: optionalString(500),
  // Consumer / business distinction — drives which UK consumer-protection
  // rules apply to the membership subscription.
  traderStatus: z.enum(["consumer", "business"]).optional().or(z.literal("")),
  businessName: optionalString(200),
  vatNumber: optionalString(40),
  // Optional — discipline + sub-styles cover most categorisation
  // needs and forcing a single primary medium felt restrictive
  // for mixed-media artists. UI now labels this "(optional)".
  primaryMedium: optionalString(100),
  // Phase 3 taxonomy. Optional to keep back-compat with any in-flight forms.
  // "digital" accepted for legacy payloads — it maps onto drawing on read.
  discipline: z
    .enum(["photography", "painting", "digital", "drawing", "sketching", "sculpture", "mixed"])
    .optional(),
  subStyles: z.array(z.string().max(50)).max(20).optional(),
  // Portfolio link and statement are flagged as optional in the UI — must
  // match here. Users were previously bouncing off the API silently because
  // these were required server-side.
  portfolioLink: optionalString(500),
  // Up to 3 sample-work URLs from artists who have no website /
  // socials to link. Stored alongside portfolioLink in the DB —
  // see /api/apply for the merge.
  sampleWorkUrls: z.array(z.string().max(500)).max(3).optional(),
  artistStatement: optionalString(2000),
  offersOriginals: z.boolean().optional(),
  offersPrints: z.boolean().optional(),
  offersFramed: z.boolean().optional(),
  offersCommissions: z.boolean().optional(),
  openToFreeLoan: z.boolean().optional(),
  openToRevenueShare: z.boolean().optional(),
  openToPurchase: z.boolean().optional(),
  deliveryRadius: optionalString(100),
  venueTypes: z.array(z.string().max(100)).max(20).optional(),
  themes: z.array(z.string().max(100)).max(20).optional(),
  hearAbout: optionalString(200),
  selectedPlan: z.enum(["core", "pro", "premium"]).optional(),
  referralCode: optionalString(20),
});

export const registerVenueSchema = z.object({
  venueName: safeString(200),
  venueType: safeString(100),
  contactName: safeString(100),
  email,
  phone: optionalString(30),
  addressLine1: safeString(200),
  addressLine2: optionalString(200),
  city: safeString(100),
  postcode: safeString(20),
  wallSpace: optionalString(100),
  artInterests: z.array(z.string().max(100)).max(20).optional(),
  message: optionalString(2000),
  hearAbout: optionalString(200),
});

// Auth-required routes
export const messageSchema = z.object({
  conversationId: optionalString(100),
  senderId: optionalString(100),
  senderName: safeString(100),
  senderType: z.enum(["artist", "venue", "anonymous"]).optional(),
  recipientSlug: safeString(100),
  content: safeString(5000),
  messageType: z.enum(["text", "placement_request", "placement_response"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const placementSchema = z.object({
  id: safeString(100),
  artistUserId: optionalString(100),
  workTitle: safeString(200),
  workImage: optionalString(1000),
  venueSlug: safeString(100),
  venue: optionalString(200),
  type: z.enum(["free_loan", "revenue_share", "purchase"]),
  revenueSharePercent: z.number().min(0).max(100).optional(),
  status: z.enum(["pending", "active", "declined", "completed", "paused"]).optional(),
  revenue: z.number().min(0).optional(),
  notes: optionalString(1000),
  message: optionalString(2000),
  qrEnabled: z.boolean().optional(),
  monthlyFeeGbp: z.number().min(0).max(100000).optional(),
  // Additional works covered by the same placement. The primary work
  // still lives in workTitle / workImage; extras ride along and share
  // terms + lifecycle. Capped at 20 so a single placement can't be
  // used to shove an entire portfolio into one row.
  extraWorks: z.array(z.object({
    title: safeString(200),
    image: optionalString(1000),
    size: optionalString(100),
  })).max(20).optional(),
  requestedDimensions: optionalString(100),
});

export const placementUpdateSchema = z.object({
  id: safeString(100),
  status: z.enum(["pending", "active", "declined", "completed", "paused", "cancelled"]).optional(),
  stage: z.enum(["scheduled", "installed", "live", "collected"]).optional(),
  // Optional explicit stage timestamp in ISO 8601. Lets the user pick
  // a future install date instead of being forced to "now". Used by the
  // progress bar's Schedule action.
  stageDate: z.string().datetime().optional(),
  // Reverse a previously-stamped stage. Powers the Undo button on the
  // progress bar — clears the timestamp on that stage (and only the
  // most recently reached stage is allowed, see API for the gate).
  unsetStage: z.enum(["scheduled", "installed", "live", "collected"]).optional(),
  // A counter offer keeps the row pending but revises the terms and hands the
  // "needs to respond" role back to the original requester.
  counter: z.object({
    revenueSharePercent: z.number().min(0).max(100).optional(),
    qrEnabled: z.boolean().optional(),
    monthlyFeeGbp: z.number().min(0).max(100000).optional(),
    arrangementType: z.enum(["free_loan", "revenue_share", "purchase"]).optional(),
    message: optionalString(2000),
  }).optional(),
});

export const checkoutSchema = z.object({
  items: z.array(z.object({
    title: safeString(200),
    artistName: safeString(100),
    artistSlug: optionalString(100),
    size: safeString(50),
    price: z.number().positive().max(100000),
    quantity: z.number().int().positive().max(10),
    image: optionalString(2000),
    shippingPrice: z.number().min(0).max(1000).optional(),
  })).min(1).max(50),
  shipping: z.object({
    fullName: safeString(100),
    email,
    phone: safeString(30),
    addressLine1: safeString(200),
    addressLine2: optionalString(200),
    city: safeString(100),
    postcode: safeString(20),
    country: safeString(100),
    notes: optionalString(500),
  }),
});
