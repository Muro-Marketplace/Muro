import { z } from "zod";
import { isValidPostcode } from "./postcode";

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
  // Consumer / business distinction, drives which UK consumer-protection
  // rules apply to the membership subscription.
  traderStatus: z.enum(["consumer", "business"]).optional().or(z.literal("")),
  businessName: optionalString(200),
  vatNumber: optionalString(40),
  // Optional, discipline + sub-styles cover most categorisation
  // needs and forcing a single primary medium felt restrictive
  // for mixed-media artists. UI now labels this "(optional)".
  primaryMedium: optionalString(100),
  // Phase 3 taxonomy. Optional to keep back-compat with any in-flight forms.
  // "digital" accepted for legacy payloads, it maps onto drawing on read.
  discipline: z
    .enum(["photography", "painting", "digital", "drawing", "sketching", "sculpture", "mixed"])
    .optional(),
  subStyles: z.array(z.string().max(50)).max(20).optional(),
  // Portfolio link and statement are flagged as optional in the UI, must
  // match here. Users were previously bouncing off the API silently because
  // these were required server-side.
  portfolioLink: optionalString(500),
  // Up to 3 sample-work URLs from artists who have no website /
  // socials to link. Stored alongside portfolioLink in the DB,
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
  // A43: the free-text description behind the "Other" venue type. The form
  // always posts it; without this field zod stripped it and the venue's own
  // words never reached the database. The route folds it into `message`
  // (venue_registrations has no column for it, and a migration is out of
  // scope), so it must survive parsing here.
  customVenueType: optionalString(100),
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
  // Attachments allow content to be empty; validated post-parse below.
  content: z.string().max(5000),
  messageType: z.enum(["text", "placement_request", "placement_response"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  attachments: z
    .array(
      z.object({
        url: z.string().url().max(2000),
        filename: z.string().max(200),
        mimeType: z.string().max(100),
        sizeBytes: z.number().int().nonnegative(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      })
    )
    .max(10)
    .optional(),
});

export const placementSchema = z.object({
  id: safeString(100),
  artistUserId: optionalString(100),
  workTitle: safeString(200),
  workImage: optionalString(1000),
  venueSlug: safeString(100),
  venue: optionalString(200),
  type: z.enum(["free_loan", "paid_loan", "revenue_share", "purchase"]),
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

/**
 * E46b. POST /api/terms/accept previously took four free-text fields with no
 * caps and no validation, on an unauthenticated insert, which is a
 * storage-exhaustion vector as well as a forgery one. `userEmail` is accepted
 * here but the route IGNORES it whenever the caller is authenticated: an
 * authenticated acceptance takes the email from the token, never the body.
 */
/**
 * E46a (06 B5). POST /api/artist-works destructured the body and passed it
 * straight to the write with no numeric validation: `pricing` had no array cap
 * and no per-entry price check, `quantity_available` had no lower bound (and
 * checkout treats <= 0 as sold, so a negative value reads as permanently sold),
 * and `shipping_price` was stored unbounded even though the checkout schema caps
 * what a cart may claim.
 *
 * `pricing` is the one that reaches money: checkout recomputes unit_amount from
 * the stored tier, so a bad tier price feeds Stripe. It is defended there too
 * (a non-positive tier falls back to the client price), which makes this a
 * correctness and trust problem rather than direct theft. Fixed at the write
 * boundary regardless.
 *
 * `inStorePrice` joined 2026-08-28 (owner decision 14 / migration 118): the
 * column exists now, so the value the portfolio always collected can persist.
 */
const money = (max: number) => z.number().finite().min(0).max(max);

export const sizePricingSchema = z.object({
  label: safeString(100),
  price: money(100_000),
});

export const artistWorkInputSchema = z.object({
  id: safeString(200),
  title: safeString(200),
  image: safeString(2000),
  medium: optionalString(100),
  dimensions: optionalString(200),
  priceBand: optionalString(100),
  // Capped so one work cannot carry hundreds of tiers, and floored at 0 so
  // checkout can never recompute from a negative tier.
  pricing: z.array(sizePricingSchema).max(30).optional(),
  available: z.boolean().optional(),
  color: optionalString(20),
  orientation: z.enum(["portrait", "landscape", "square"]).optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  shippingPrice: money(1000).nullable().optional(),
  // Same cap as a per-size price: this IS a price, not a shipping fee.
  inStorePrice: money(100_000).nullable().optional(),
  // Owner decision 2026-08-28: the tick box that replaced the in-store price
  // model. inStorePrice above stays accepted (and ignored by the route) so an
  // old client tab cannot 400 a whole save.
  availableInStore: z.boolean().optional(),
  quantityAvailable: z.number().int().min(0).max(10_000).nullable().optional(),
  description: optionalString(2000),
  images: z.array(z.string().max(2000)).max(10).optional(),
  // Replaces the 45-line hand-rolled sanitiser this route used to carry. The
  // .max(20) preserves its .slice(0, 20) semantics.
  frameOptions: z
    .array(
      z.object({
        label: safeString(80),
        priceUplift: money(10_000),
        imageUrl: optionalString(1000),
        pricesBySize: z.record(z.string().min(1).max(100), money(10_000)).optional(),
      }),
    )
    .max(20)
    .optional(),
});

export const termsAcceptSchema = z.object({
  userEmail: z.string().trim().toLowerCase().email().max(320),
  userType: z.enum(["artist", "venue", "customer"]),
  termsVersion: safeString(50),
  termsType: safeString(50),
});

export const placementUpdateSchema = z.object({
  id: safeString(100),
  // "completed" is deliberately absent (E23b). It is reachable only through
  // stage:"collected", which also stamps collected_at and triggers the
  // inventory restore. Accepting it here made a second path to the same status
  // that skipped both, silently burning the artist's stock. No client sends it.
  status: z.enum(["pending", "active", "declined", "paused", "cancelled"]).optional(),
  stage: z.enum(["scheduled", "installed", "live", "collected"]).optional(),
  // Optional explicit stage timestamp in ISO 8601. Lets the user pick
  // a future install date instead of being forced to "now". Used by the
  // progress bar's Schedule action.
  stageDate: z.string().datetime().optional(),
  // Reverse a previously-stamped stage. Powers the Undo button on the
  // progress bar, clears the timestamp on that stage (and only the
  // most recently reached stage is allowed, see API for the gate).
  unsetStage: z.enum(["scheduled", "installed", "live", "collected"]).optional(),
  // Owner decision 2026-08-28: the buy-off-the-wall offer for THIS placed
  // piece. Artist-only (enforced in the route). An explicit null price turns
  // the offer off; both fields may ride alone or alongside a stage change
  // (the live-on-wall prompt sends them together).
  inStorePrice: z.number().positive().max(100_000).nullable().optional(),
  inStoreFrameIncluded: z.boolean().optional(),
  // A counter offer keeps the row pending but revises the terms and hands the
  // "needs to respond" role back to the original requester.
  counter: z.object({
    // The route clamps this to the product's 0..50 cap (D26); the wider
    // bound here keeps old client tabs from 400ing a whole counter.
    revenueSharePercent: z.number().min(0).max(100).optional(),
    qrEnabled: z.boolean().optional(),
    monthlyFeeGbp: z.number().min(0).max(100000).optional(),
    // "mixed" (paid loan + revenue share) included since F27: clients now
    // send the derived canonical type. The route re-derives regardless.
    arrangementType: z.enum(["free_loan", "paid_loan", "revenue_share", "purchase", "mixed"]).optional(),
    message: optionalString(2000),
  }).optional(),
});

// Cart line shape — shared between the ship and collection branches.
const checkoutItemSchema = z.object({
  title: safeString(200),
  artistName: safeString(100),
  artistSlug: optionalString(100),
  size: safeString(50),
  price: z.number().positive().max(100000),
  quantity: z.number().int().positive().max(10),
  image: optionalString(2000),
  shippingPrice: z.number().min(0).max(1000).optional(),
  // Surfaced through to the API so the shared shipping helper can
  // do per-item dimension-based estimation, regional override, and
  // framed-uplift, same inputs the display page uses, so the cart
  // total and the Stripe charge can never drift.
  internationalShippingPrice: z.number().min(0).max(1000).optional(),
  dimensions: optionalString(200),
  framed: z.boolean().optional(),
  // E46c (06 B6). Frame identity on the cart line, so checkout can resolve the
  // uplift from the work's own frame_options instead of trusting the client's
  // total. Optional: legacy carts fall back to splitting `size` on " + ".
  frameLabel: z.string().trim().max(80).optional(),
  // Cart line identity — `workId` for individual artworks, `collectionId`
  // for bundles. Both optional because legacy localStorage carts may
  // pre-date the field, but G2-15 cart re-validation needs at least
  // one to look the row up against the DB.
  type: z.enum(["work", "collection"]).optional(),
  workId: optionalString(200),
  collectionId: optionalString(200),
  // T9 (N2a). Per-line fulfilment: absent means "follow the order-level
  // choice". `collect_venue` lines name the placement they collect against;
  // the server re-validates BOTH against the live placements table
  // (api/checkout), so these are claims to check, never facts to trust.
  lineFulfilment: z.enum(["ship", "collect_venue"]).optional(),
  collectVenueSlug: optionalString(100),
  collectPlacementId: optionalString(200),
});

// Shipping subset for "Collect from artist" — buyer picks up in person,
// so addressLine1/city/postcode are optional. We still keep the maxlength
// caps active when a value IS supplied so a malicious payload can't sneak
// a 600-char addressLine through the collection door.
const collectionShippingSchema = z.object({
  fullName: safeString(100),
  email,
  phone: safeString(30),
  addressLine1: optionalString(200),
  addressLine2: optionalString(200),
  city: optionalString(100),
  postcode: optionalString(20),
  country: safeString(100),
  notes: optionalString(500),
});

// Full shipping address — required for ship-mode orders.
const shipShippingSchema = z.object({
  fullName: safeString(100),
  email,
  phone: safeString(30),
  addressLine1: safeString(200),
  addressLine2: optionalString(200),
  city: safeString(100),
  postcode: safeString(20),
  country: safeString(100),
  notes: optionalString(500),
});

// Top-level metadata fields shared by both fulfilment branches. Lives
// in a base object so we don't repeat them in each variant. Task 1
// review flagged that the route was reading `body.source` etc. straight
// off the un-validated input — once these are on the schema, the route
// can read `parsed.data.source` and benefit from the trim/cap.
const checkoutMetaShape = {
  // ?ref= passed through from the artwork or QR landing — used for
  // attribution; "direct" when none. Capped at 100 chars to stop a
  // malicious source string DoSing the metadata column.
  source: optionalString(100),
  venueSlug: optionalString(100),
  // D10: server-signed venue attribution from the QR redirect. When present it is
  // verified and takes precedence over the bare venueSlug above, which is only a
  // backward-compat fallback for QR codes printed before the token existed. Capped
  // generously; a real token is ~200 chars.
  venueAttributionToken: optionalString(600),
  // Client-computed shipping figure for divergence logging. Capped at
  // £10k as a sanity bound; real orders top out an order of magnitude
  // below that. Cleared on undefined so old callers still work.
  expectedShippingCost: z.number().min(0).max(10000).optional(),
  expectedSubtotal: z.number().min(0).max(1_000_000).optional(),
  collectionNotes: optionalString(1000),
};

// Discriminated on fulfilmentMethod. The client sends 'ship' (default)
// or 'collection'. We accept an omitted fulfilmentMethod for back-compat
// and treat it as 'ship' (older callers may still POST without the field).
const shipCheckoutSchema = z.object({
  fulfilmentMethod: z.literal("ship"),
  items: z.array(checkoutItemSchema).min(1).max(50),
  shipping: shipShippingSchema,
  ...checkoutMetaShape,
});

const collectionCheckoutSchema = z.object({
  fulfilmentMethod: z.literal("collection"),
  items: z.array(checkoutItemSchema).min(1).max(50),
  shipping: collectionShippingSchema,
  ...checkoutMetaShape,
});

// T9 (N2b). Collect-from-VENUE: the buyer pays online and picks the work up
// from the venue wall it is hanging on. Same reduced shipping shape as
// collect-from-artist (name, email, phone; no address needed to post to), and
// every line must carry its placement claim, which api/checkout verifies
// against the live placements table.
const venueCollectionCheckoutSchema = z.object({
  fulfilmentMethod: z.literal("collect_venue"),
  items: z.array(checkoutItemSchema).min(1).max(50),
  shipping: collectionShippingSchema,
  ...checkoutMetaShape,
});

export const checkoutSchema = z.preprocess(
  // Normalise an absent fulfilmentMethod to 'ship' so legacy clients that
  // didn't send the field keep working. Anything non-object falls through
  // to the union which will reject with a useful error.
  (input) => {
    if (input && typeof input === "object" && !("fulfilmentMethod" in input)) {
      return { ...input, fulfilmentMethod: "ship" };
    }
    return input;
  },
  z.discriminatedUnion("fulfilmentMethod", [
    shipCheckoutSchema,
    collectionCheckoutSchema,
    venueCollectionCheckoutSchema,
  ])
    // Country-aware postcode format check — only meaningful on the ship
    // branch. Collection mode treats postcode as optional and may have
    // it blank, so we skip the format check there. Lives at the union
    // level so the discriminated union itself stays a ZodObject pair.
    .superRefine((data, ctx) => {
      if (data.fulfilmentMethod !== "ship") return;
      const postcode = data.shipping?.postcode;
      const country = data.shipping?.country;
      if (
        typeof postcode === "string" &&
        typeof country === "string" &&
        postcode.length > 0 &&
        !isValidPostcode(postcode, country)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shipping", "postcode"],
          message: "Postcode doesn't match the expected format for this country.",
        });
      }
    }),
);

// Customer address book (PR-4 G2-21). Used by /api/customer-addresses
// for create/update; the GET path returns whatever is in DB so we don't
// gate retrieval on Zod.
const customerAddressFieldsShape = {
  fullName: safeString(100),
  line1: safeString(200),
  line2: optionalString(200),
  city: safeString(100),
  postcode: safeString(20),
  country: safeString(100),
  isDefault: z.boolean().optional(),
};

const postcodeFormatRefiner = (
  data: { postcode?: string; country?: string },
  ctx: z.RefinementCtx,
) => {
  if (
    typeof data.postcode === "string" &&
    typeof data.country === "string" &&
    data.postcode.length > 0 &&
    !isValidPostcode(data.postcode, data.country)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["postcode"],
      message: "Postcode doesn't match the expected format for this country.",
    });
  }
};

export const customerAddressInputSchema = z
  .object(customerAddressFieldsShape)
  .superRefine(postcodeFormatRefiner);

export const customerAddressUpdateSchema = z
  .object(customerAddressFieldsShape)
  .partial()
  .superRefine(postcodeFormatRefiner);
