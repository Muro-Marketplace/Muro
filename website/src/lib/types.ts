export type CartItemType = "work" | "collection";

export interface CartItem {
  id: string;
  type: CartItemType;
  workId?: string;
  collectionId?: string;
  artistSlug: string;
  artistName: string;
  title: string;
  image: string;
  size: string;
  price: number;
  quantity: number;
  /** Live stock cap for the selected size. Optional, undefined means unlimited
      (e.g. collections / bundles where stock is implicit). */
  quantityAvailable?: number | null;
  shippingPrice?: number;
  internationalShippingPrice?: number;
  /** Dimensions string for the selected size ("50 x 70 cm", "A2", …).
      Used by the shipping calculator when the artist hasn't set a
      manual shippingPrice. */
  dimensions?: string;
  /** True when this is the framed variant, affects weight + tier. */
  framed?: boolean;
  /** E46c: which frame, so checkout can resolve the uplift server-side from the
      work's own frame_options instead of trusting the line's total. */
  frameLabel?: string;
  /** T9 / N2a: per-line fulfilment. Absent = follow the order-level choice.
      Collect-from-venue lines carry their placement claim; api/checkout
      re-validates it against the live placements table before any money moves,
      so these are claims to check, never facts to trust. */
  lineFulfilment?: "ship" | "collect_venue";
  collectVenueSlug?: string;
  /** B18: display only. The SLUG above is the claim the checkout API
      re-validates against the live placements table; this is just the name to
      show the buyer, because "Show your order number at the-copper-kettle"
      is not a sentence anybody should read. */
  collectVenueName?: string;
  collectPlacementId?: string;
}

export interface ShippingInfo {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  country: string;
  notes?: string;
}

export interface MockOrder {
  id: string;
  items: CartItem[];
  shipping: ShippingInfo;
  subtotal: number;
  shippingCost: number;
  total: number;
  status: "confirmed";
  createdAt: string;
}

export interface SavedItem {
  type: "work" | "collection" | "artist";
  id: string;
  savedAt: string;
}
