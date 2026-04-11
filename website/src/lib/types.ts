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
