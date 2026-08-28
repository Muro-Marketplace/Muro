import { describe, it, expect } from "vitest";
import { parsePayload } from "./types";

describe("parsePayload()", () => {
  it("accepts a well-formed blog payload", () => {
    const out = parsePayload("blog", {
      blog_id: "11111111-1111-1111-1111-111111111111",
      title: "On colour",
      excerpt: "Colour is the keyboard, the eyes are the harmonies.",
    });
    expect(out).toEqual({
      type: "blog",
      blog_id: "11111111-1111-1111-1111-111111111111",
      title: "On colour",
      excerpt: "Colour is the keyboard, the eyes are the harmonies.",
    });
  });

  it("accepts a feature_request payload with optionals", () => {
    const out = parsePayload("feature_request", {
      title: "Calendar sync",
      description: "Add an iCal export for placement collection dates.",
      contact_email: "  user@example.com  ",
      user_agent: "Mozilla/5.0 (test)",
    });
    expect(out).toEqual({
      type: "feature_request",
      title: "Calendar sync",
      description: "Add an iCal export for placement collection dates.",
      contact_email: "user@example.com",
      user_agent: "Mozilla/5.0 (test)",
    });
  });

  it("accepts a feedback payload with optionals", () => {
    const out = parsePayload("feedback", {
      message: "Love the new placement panel.",
      rating: 5,
      contact_email: "fan@example.com",
      source_url: "/placements/123",
      user_agent: "Mozilla/5.0 (test)",
    });
    expect(out).toEqual({
      type: "feedback",
      message: "Love the new placement panel.",
      rating: 5,
      contact_email: "fan@example.com",
      source_url: "/placements/123",
      user_agent: "Mozilla/5.0 (test)",
    });
  });

  it("rejects feedback rating outside 1-5 and non-integers", () => {
    for (const rating of [0, 6, 3.5, -1, "5"]) {
      const out = parsePayload("feedback", { message: "Hi", rating });
      expect(out).not.toBeNull();
      expect((out as { rating?: number }).rating).toBeUndefined();
    }
  });

  it("returns null when blog is missing required fields", () => {
    expect(parsePayload("blog", { title: "Only title" })).toBeNull();
    expect(parsePayload("blog", { blog_id: "x", title: "y" })).toBeNull();
    expect(
      parsePayload("blog", {
        blog_id: " ",
        title: "y",
        excerpt: "z",
      }),
    ).toBeNull();
  });

  it("returns null when feature_request is missing required fields", () => {
    expect(parsePayload("feature_request", { title: "x" })).toBeNull();
    expect(
      parsePayload("feature_request", { title: "", description: "y" }),
    ).toBeNull();
  });

  it("returns null when feedback message is missing", () => {
    expect(parsePayload("feedback", {})).toBeNull();
    expect(parsePayload("feedback", { message: "" })).toBeNull();
  });

  it("returns null on non-object payloads", () => {
    expect(parsePayload("blog", null)).toBeNull();
    expect(parsePayload("blog", "string")).toBeNull();
    expect(parsePayload("blog", 42)).toBeNull();
    // Arrays are technically objects in JS but they lack the keys we need,
    // so the missing-required-field check rejects them.
    expect(parsePayload("blog", [])).toBeNull();
  });

  it("trims surrounding whitespace on required string fields", () => {
    const out = parsePayload("feedback", { message: "  has whitespace  " });
    expect(out).toEqual({ type: "feedback", message: "has whitespace" });
  });
});


// Owner decision 11: the message member, added so a flagged message has
// somewhere an admin actually looks.
describe("parsePayload: message", () => {
  const GOOD = {
    message_id: "msg-1",
    conversation_id: "conv-1",
    sender_slug: "maya-chen",
    recipient_slug: "the-copper-kettle",
    flag_reason: "spammy link",
    excerpt: "Buy cheap prints at...",
  };

  it("accepts a complete payload", () => {
    expect(parsePayload("message", GOOD)).toEqual({ type: "message", ...GOOD });
  });

  it("rejects a payload missing any required field", () => {
    for (const key of Object.keys(GOOD)) {
      const partial: Record<string, unknown> = { ...GOOD };
      delete partial[key];
      expect(parsePayload("message", partial), key).toBeNull();
    }
  });

  it("rejects non-string fields rather than coercing", () => {
    expect(parsePayload("message", { ...GOOD, message_id: 42 })).toBeNull();
  });
});
