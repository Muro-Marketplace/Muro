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
