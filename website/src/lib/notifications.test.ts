// WS6.3 (R6.F6). Bells had no idempotency anywhere: the notifications table
// had no unique key and createNotification took none, so a Stripe redelivery,
// a cron re-run or a repeated stage PATCH double-belled. Migration 123 added
// notifications.idempotency_key with a partial unique index; these tests pin
// the client half of the contract: the key is passed through when given, a
// 23505 on a keyed insert is a silent success (the dedup working), and every
// other failure still logs loudly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn() }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert: insertMock }) }),
}));

import { createNotification } from "./notifications";

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("createNotification idempotency (WS6.3)", () => {
  it("passes the key through to the insert when provided", async () => {
    await createNotification({
      userId: "u-1",
      kind: "placement_installed",
      title: "Artwork installed",
      idempotencyKey: "placement_installed:pl-1:u-1",
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u-1",
        kind: "placement_installed",
        idempotency_key: "placement_installed:pl-1:u-1",
      }),
    );
  });

  it("inserts a null key for legacy callers, keeping them unconstrained", async () => {
    await createNotification({ userId: "u-1", kind: "sale", title: "Your artwork sold" });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: null }),
    );
  });

  it("treats a 23505 on a keyed insert as silent success", async () => {
    insertMock.mockResolvedValue({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    await createNotification({
      userId: "u-1",
      kind: "qr_scan_digest",
      title: "3 QR scans yesterday",
      idempotencyKey: "qr_scan_digest:u-1:2026-08-27",
    });
    // Fail-before: the duplicate logged as "[notifications] insert failed".
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still logs a 23505 loudly when no key was passed, since that is not dedup", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await createNotification({ userId: "u-1", kind: "sale", title: "Your artwork sold" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("still logs every other insert failure", async () => {
    insertMock.mockResolvedValue({ error: { code: "42P01", message: "relation does not exist" } });
    await createNotification({
      userId: "u-1",
      kind: "sale",
      title: "Your artwork sold",
      idempotencyKey: "sale:o-1:u-1",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "[notifications] insert failed:",
      expect.objectContaining({ code: "42P01" }),
    );
  });

  it("skips the insert entirely with no userId", async () => {
    await createNotification({ userId: "", kind: "sale", title: "x" });
    expect(insertMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
