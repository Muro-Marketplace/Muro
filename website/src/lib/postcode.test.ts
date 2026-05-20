import { describe, expect, it } from "vitest";
import { isValidPostcode } from "./postcode";

describe("isValidPostcode", () => {
  it("accepts valid UK postcodes (with and without space, mixed case)", () => {
    expect(isValidPostcode("SW1A 1AA", "GB")).toBe(true);
    expect(isValidPostcode("sw1a1aa", "GB")).toBe(true);
    expect(isValidPostcode("EC1V 9AA", "GB")).toBe(true);
    expect(isValidPostcode("M1 1AA", "GB")).toBe(true);
    expect(isValidPostcode("CR2 6XH", "GB")).toBe(true);
  });

  it("rejects 'ab' or phone numbers under GB", () => {
    expect(isValidPostcode("ab", "GB")).toBe(false);
    expect(isValidPostcode("0207 123 4567", "GB")).toBe(false);
    expect(isValidPostcode("9999999999999999999", "GB")).toBe(false);
    expect(isValidPostcode("", "GB")).toBe(false);
  });

  it("accepts US ZIP and ZIP+4", () => {
    expect(isValidPostcode("94110", "US")).toBe(true);
    expect(isValidPostcode("94110-1234", "US")).toBe(true);
  });

  it("rejects non-numeric ZIP", () => {
    expect(isValidPostcode("xyz", "US")).toBe(false);
    expect(isValidPostcode("9411", "US")).toBe(false);
  });

  it("accepts Canadian postcodes", () => {
    expect(isValidPostcode("K1A 0B1", "CA")).toBe(true);
    expect(isValidPostcode("K1A0B1", "CA")).toBe(true);
  });

  it("falls back to non-empty 1 to 20 char rule for unsupported countries", () => {
    expect(isValidPostcode("123 ABC", "FR")).toBe(true);
    expect(isValidPostcode("75001", "FR")).toBe(true);
    expect(isValidPostcode("", "FR")).toBe(false);
  });

  it("rejects strings >20 chars regardless of country", () => {
    expect(isValidPostcode("x".repeat(21), "GB")).toBe(false);
    expect(isValidPostcode("x".repeat(21), "FR")).toBe(false);
  });

  it("country code is case-insensitive", () => {
    expect(isValidPostcode("SW1A 1AA", "gb")).toBe(true);
    expect(isValidPostcode("94110", "us")).toBe(true);
  });
});
