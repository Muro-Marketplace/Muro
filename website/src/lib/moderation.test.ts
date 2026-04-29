// Covers tests #21 and #22 from docs/security/AUDIT.md §3.4:
//   21. Moderation: blocked phrase rejects message
//   22. Moderation: flagged phrase delivers + flags

import { describe, expect, it } from "vitest";
import { moderateMessage } from "./moderation";

describe("moderateMessage(), length guards", () => {
  it("rejects messages under 2 chars", () => {
    expect(moderateMessage("a")).toEqual({ allowed: false, flagged: false, reason: expect.stringMatching(/too short/i) });
  });

  it("rejects whitespace-only", () => {
    expect(moderateMessage("   ")).toEqual({ allowed: false, flagged: false, reason: expect.stringMatching(/too short/i) });
  });

  it("accepts exactly 2 chars", () => {
    const r = moderateMessage("ok");
    expect(r.allowed).toBe(true);
  });

  it("rejects > 5000 chars", () => {
    const r = moderateMessage("a".repeat(5001));
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/too long/i);
  });

  it("accepts exactly 5000 chars", () => {
    const r = moderateMessage("a".repeat(5000));
    expect(r.allowed).toBe(true);
  });
});

describe("moderateMessage(), blocked content", () => {
  const blocked = [
    "Buy now, limited time offer!",
    "Congratulations you won a prize",
    "click here to claim your money",
    "act now to get free money",
    "Visit https://bit.ly/a and https://bit.ly/b and https://bit.ly/c for deals",
    "call me on 07700 900123, I'll sort you out",
    "email me at steve@gmail.com please",
  ];

  for (const msg of blocked) {
    it(`blocks: ${msg.slice(0, 40)}…`, () => {
      const r = moderateMessage(msg);
      expect(r.allowed).toBe(false);
      expect(r.flagged).toBe(true);
      expect(r.reason).toMatch(/blocked/i);
    });
  }
});

describe("moderateMessage(), flagged but allowed", () => {
  const flagged = [
    "Happy to accept paypal if it's easier",
    "Pay me directly and we can skip the platform fee",
    "Let's do this without Wallplace",
    "Wire transfer would be simpler",
  ];

  for (const msg of flagged) {
    it(`flags + allows: ${msg.slice(0, 40)}…`, () => {
      const r = moderateMessage(msg);
      expect(r.allowed).toBe(true);
      expect(r.flagged).toBe(true);
      expect(r.reason).toMatch(/flagged/i);
    });
  }
});

describe("moderateMessage(), clean messages pass through", () => {
  const clean = [
    "Hello, would love to show some work at your venue",
    "What's your wall size? I've got 3 pieces that could suit",
    "I'm free Tuesday 2pm for an install. Does that work?",
    "Thanks for the chat today!",
  ];
  for (const msg of clean) {
    it(`allows: ${msg.slice(0, 40)}…`, () => {
      expect(moderateMessage(msg)).toEqual({ allowed: true, flagged: false });
    });
  }
});

describe("moderateMessage(), regression checks", () => {
  it("doesn't flag 'paypa' partial match (word boundary enforced)", () => {
    expect(moderateMessage("my colour palette is papay-ish").allowed).toBe(true);
  });

  it("doesn't flag 'skip' alone without platform context", () => {
    expect(moderateMessage("I'll skip lunch and see you then").allowed).toBe(true);
  });
});
