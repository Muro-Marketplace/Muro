// Validation schemas are the boundary between client input and the DB.
// Tests focus on the bits that matter for security: length caps, enum
// allowlists, numeric bounds, and required-vs-optional.

import { describe, expect, it } from "vitest";
import {
  applySchema,
  checkoutSchema,
  contactSchema,
  messageSchema,
  placementSchema,
  placementUpdateSchema,
  waitlistSchema,
} from "./validations";

describe("waitlistSchema", () => {
  // Row A L364 / migration 129. The form posts phone, venueName and
  // venueLocation and this schema declared none of them, so zod stripped all
  // three at the validation boundary and no writer ever saw them. A venue
  // joining the waiting list gave us their venue's name and where it is, and we
  // kept neither, which is what made the list unworkable.
  it("keeps the three fields the form asks for", () => {
    const r = waitlistSchema.safeParse({
      name: "Hannah Reed",
      email: "hannah@copperkettle.test",
      userType: "venue",
      phone: "07700900123",
      venueName: "The Copper Kettle",
      venueLocation: "Hampton",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBe("07700900123");
      expect(r.data.venueName).toBe("The Copper Kettle");
      expect(r.data.venueLocation).toBe("Hampton");
    }
  });

  it("still accepts an artist signup that gives none of them", () => {
    const r = waitlistSchema.safeParse({ name: "Maya", email: "maya@x.com", userType: "artist" });
    expect(r.success).toBe(true);
  });

  it("accepts a valid signup", () => {
    const r = waitlistSchema.safeParse({ name: "Maya Chen", email: "maya@x.com", userType: "artist" });
    expect(r.success).toBe(true);
  });

  it("rejects bad email", () => {
    const r = waitlistSchema.safeParse({ name: "Maya", email: "not-an-email", userType: "artist" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown userType (enum guard)", () => {
    const r = waitlistSchema.safeParse({ name: "Maya", email: "a@b.com", userType: "admin" });
    expect(r.success).toBe(false);
  });

  it("rejects oversized name (100 char cap)", () => {
    const r = waitlistSchema.safeParse({ name: "A".repeat(101), email: "a@b.com", userType: "artist" });
    expect(r.success).toBe(false);
  });
});

describe("contactSchema", () => {
  it("accepts a valid message", () => {
    expect(contactSchema.safeParse({ name: "X", email: "x@y.com", type: "hello", message: "hi" }).success).toBe(true);
  });

  it("caps message at 2000 chars", () => {
    const r = contactSchema.safeParse({ name: "X", email: "x@y.com", type: "hello", message: "a".repeat(2001) });
    expect(r.success).toBe(false);
  });
});

describe("messageSchema", () => {
  const base = {
    conversationId: "dm-a__b",
    senderName: "maya-chen",
    recipientSlug: "the-curzon",
    content: "Hello",
  };

  it("accepts a minimal valid message", () => {
    expect(messageSchema.safeParse(base).success).toBe(true);
  });

  it("rejects content over 5000 chars", () => {
    const r = messageSchema.safeParse({ ...base, content: "a".repeat(5001) });
    expect(r.success).toBe(false);
  });

  it("rejects unknown senderType", () => {
    const r = messageSchema.safeParse({ ...base, senderType: "admin" });
    expect(r.success).toBe(false);
  });

  it("rejects unknown messageType", () => {
    const r = messageSchema.safeParse({ ...base, messageType: "malicious" });
    expect(r.success).toBe(false);
  });

  it("empty content is allowed at the schema level — emptiness is enforced server-side after attachments are factored in", () => {
    // After F2 (message attachments), the schema permits empty content
    // because a message with one or more attachments is valid. The
    // route-level POST handler still rejects "no content AND no
    // attachments" with a 400.
    expect(messageSchema.safeParse({ ...base, content: "" }).success).toBe(true);
    expect(messageSchema.safeParse({ ...base, content: "   " }).success).toBe(true);
  });

  it("accepts well-formed attachments[]", () => {
    const r = messageSchema.safeParse({
      ...base,
      content: "",
      attachments: [{
        url: "https://example.com/img.png",
        filename: "img.png",
        mimeType: "image/png",
        sizeBytes: 1024,
      }],
    });
    expect(r.success).toBe(true);
  });
});

describe("placementSchema", () => {
  const base = {
    id: "p_test",
    workTitle: "Last Light",
    venueSlug: "the-curzon",
    type: "revenue_share",
    revenueSharePercent: 10,
    qrEnabled: true,
  };

  it("accepts a valid placement", () => {
    expect(placementSchema.safeParse(base).success).toBe(true);
  });

  it("rejects unknown type (only free_loan/paid_loan/revenue_share/purchase)", () => {
    expect(placementSchema.safeParse({ ...base, type: "gift" }).success).toBe(false);
  });

  it("accepts type=paid_loan", () => {
    expect(placementSchema.safeParse({ ...base, type: "paid_loan" }).success).toBe(true);
  });

  it("revenueSharePercent must be 0–100", () => {
    expect(placementSchema.safeParse({ ...base, revenueSharePercent: -1 }).success).toBe(false);
    expect(placementSchema.safeParse({ ...base, revenueSharePercent: 101 }).success).toBe(false);
    expect(placementSchema.safeParse({ ...base, revenueSharePercent: 0 }).success).toBe(true);
    expect(placementSchema.safeParse({ ...base, revenueSharePercent: 100 }).success).toBe(true);
  });

  it("monthlyFeeGbp caps at 100000", () => {
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 100001 }).success).toBe(false);
  });

  it("extraWorks caps at 20 entries", () => {
    const twentyOne = Array.from({ length: 21 }, (_, i) => ({ title: `w${i}` }));
    expect(placementSchema.safeParse({ ...base, extraWorks: twentyOne }).success).toBe(false);
  });
});

describe("placementUpdateSchema", () => {
  it("counter body is optional and nested", () => {
    const r = placementUpdateSchema.safeParse({
      id: "p1",
      counter: { revenueSharePercent: 15, qrEnabled: true, arrangementType: "revenue_share" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects status=invalid", () => {
    expect(placementUpdateSchema.safeParse({ id: "p1", status: "nope" }).success).toBe(false);
  });

  it("rejects stage=invalid", () => {
    expect(placementUpdateSchema.safeParse({ id: "p1", stage: "teleported" }).success).toBe(false);
  });

  it("counter.revenueSharePercent still 0–100", () => {
    expect(placementUpdateSchema.safeParse({ id: "p1", counter: { revenueSharePercent: 150 } }).success).toBe(false);
  });

  it("counter.arrangementType=paid_loan is accepted", () => {
    const r = placementUpdateSchema.safeParse({
      id: "p1",
      counter: { arrangementType: "paid_loan", monthlyFeeGbp: 50 },
    });
    expect(r.success).toBe(true);
  });

  it("counter.arrangementType rejects unknown values", () => {
    expect(
      placementUpdateSchema.safeParse({ id: "p1", counter: { arrangementType: "barter" } }).success,
    ).toBe(false);
  });
});

describe("paid-loan monthly fee floor", () => {
  const base = {
    id: "pl-1",
    workTitle: "Test work",
    venueSlug: "test-venue",
    type: "paid_loan" as const,
  };

  it("accepts zero (not a paid loan) and £15 and up", () => {
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 0 }).success).toBe(true);
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 15 }).success).toBe(true);
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 250 }).success).toBe(true);
  });

  it("rejects a rent between £0.01 and £14.99", () => {
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 5 }).success).toBe(false);
    expect(placementSchema.safeParse({ ...base, monthlyFeeGbp: 14.99 }).success).toBe(false);
  });

  it("applies the same floor to counter offers", () => {
    const counter = { id: "pl-1", counter: { monthlyFeeGbp: 10 } };
    expect(placementUpdateSchema.safeParse(counter).success).toBe(false);
    expect(
      placementUpdateSchema.safeParse({ id: "pl-1", counter: { monthlyFeeGbp: 20 } }).success,
    ).toBe(true);
  });
});

describe("checkoutSchema", () => {
  const validItem = {
    title: "Print",
    artistName: "Maya",
    size: "A3",
    price: 100,
    quantity: 1,
  };
  const validShipping = {
    fullName: "Oliver Grant",
    email: "oliver@x.com",
    phone: "07700900000",
    addressLine1: "42 Calvert Ave",
    city: "London",
    postcode: "E2 7JP",
    country: "United Kingdom",
  };

  it("accepts a valid cart", () => {
    expect(checkoutSchema.safeParse({ items: [validItem], shipping: validShipping }).success).toBe(true);
  });

  it("rejects empty cart", () => {
    expect(checkoutSchema.safeParse({ items: [], shipping: validShipping }).success).toBe(false);
  });

  it("rejects > 50 items in one cart", () => {
    const many = Array.from({ length: 51 }, () => ({ ...validItem }));
    expect(checkoutSchema.safeParse({ items: many, shipping: validShipping }).success).toBe(false);
  });

  it("rejects negative price", () => {
    expect(
      checkoutSchema.safeParse({ items: [{ ...validItem, price: -1 }], shipping: validShipping }).success,
    ).toBe(false);
  });

  it("rejects price over £100k / 100000", () => {
    expect(
      checkoutSchema.safeParse({ items: [{ ...validItem, price: 100001 }], shipping: validShipping }).success,
    ).toBe(false);
  });

  it("rejects quantity > 10 per line", () => {
    expect(
      checkoutSchema.safeParse({ items: [{ ...validItem, quantity: 11 }], shipping: validShipping }).success,
    ).toBe(false);
  });

  it("rejects non-integer quantity", () => {
    expect(
      checkoutSchema.safeParse({ items: [{ ...validItem, quantity: 1.5 }], shipping: validShipping }).success,
    ).toBe(false);
  });

  it("requires shipping.email", () => {
    const { email: _, ...noEmail } = validShipping;
    void _;
    expect(checkoutSchema.safeParse({ items: [validItem], shipping: noEmail }).success).toBe(false);
  });
});

describe("checkoutSchema fulfilment branches", () => {
  // Collection fulfilment ("Collect from artist") skips delivery — buyer
  // picks up in person, so the address fields are NOT required server-side.
  // Without this branch the schema rejects the legitimate POST and the
  // page shows a generic "Cart items and shipping required" toast.
  const validItem = {
    title: "Print",
    artistName: "Maya",
    size: "A3",
    price: 100,
    quantity: 1,
  };
  const fullShipping = {
    fullName: "Oliver Grant",
    email: "oliver@x.com",
    phone: "07700900000",
    addressLine1: "42 Calvert Ave",
    city: "London",
    postcode: "E2 7JP",
    country: "United Kingdom",
  };
  const collectionContact = {
    fullName: "Oliver Grant",
    email: "oliver@x.com",
    phone: "07700900000",
    country: "United Kingdom",
  };

  it("requires address fields when fulfilmentMethod is ship", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "ship",
      shipping: { ...collectionContact }, // no addressLine1/city/postcode
    });
    expect(result.success).toBe(false);
  });

  it("does NOT require address fields when fulfilmentMethod is collection", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "collection",
      shipping: { ...collectionContact }, // no address — should still pass
    });
    expect(result.success).toBe(true);
  });

  it("rejects collection with garbage address (still validates if provided)", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "collection",
      shipping: { ...collectionContact, addressLine1: "x".repeat(600) },
    });
    expect(result.success).toBe(false);
  });

  it("defaults to ship when fulfilmentMethod is omitted (back-compat)", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      shipping: fullShipping,
    });
    expect(result.success).toBe(true);
  });

  it("ship branch still requires email + name + phone", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "ship",
      shipping: { ...fullShipping, email: "" },
    });
    expect(result.success).toBe(false);
  });

  it("collection branch still requires email + name + phone", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "collection",
      shipping: { ...collectionContact, email: "" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts collectionNotes on the collection branch", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "collection",
      shipping: collectionContact,
      collectionNotes: "Available weekday evenings",
    });
    expect(result.success).toBe(true);
  });

  it("ship branch enforces addressLine1 length cap", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "ship",
      shipping: { ...fullShipping, addressLine1: "x".repeat(600) },
    });
    expect(result.success).toBe(false);
  });

  it("ship branch rejects garbage postcode for GB country", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "ship",
      shipping: { ...fullShipping, postcode: "ab", country: "GB" },
    });
    expect(result.success).toBe(false);
  });

  it("ship branch accepts valid postcode for GB country", () => {
    const result = checkoutSchema.safeParse({
      items: [validItem],
      fulfilmentMethod: "ship",
      shipping: { ...fullShipping, postcode: "SW1A 1AA", country: "GB" },
    });
    expect(result.success).toBe(true);
  });
});

describe("applySchema", () => {
  const base = {
    name: "Maya Chen",
    email: "maya@x.com",
    location: "London",
    primaryMedium: "Photography",
  };

  it("accepts a minimal application", () => {
    expect(applySchema.safeParse(base).success).toBe(true);
  });

  it("rejects unknown discipline (enum)", () => {
    expect(applySchema.safeParse({ ...base, discipline: "not-a-discipline" }).success).toBe(false);
  });

  it("subStyles capped at 20", () => {
    const many = Array.from({ length: 21 }, (_, i) => `s${i}`);
    expect(applySchema.safeParse({ ...base, subStyles: many }).success).toBe(false);
  });

  it("rejects selectedPlan outside the enum", () => {
    expect(applySchema.safeParse({ ...base, selectedPlan: "enterprise" }).success).toBe(false);
  });
});
