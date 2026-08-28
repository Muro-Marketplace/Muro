// WS6.5 (R6.F8). Cron failure used to be invisible: every job answered 200
// with `{failed: n}` even when every item failed, and Vercel only surfaces
// non-2xx runs. finishCronRun is the shared terminal: all-failed runs now 500
// and send one day-bucketed admin alert; partial failure and empty runs stay
// 200 with counts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendAdminAlertMock } = vi.hoisted(() => ({
  sendAdminAlertMock: vi.fn(async () => ({ ok: true as const, skipped: false as const, messageId: "m-1" })),
}));

vi.mock("@/lib/email/admin-alert", () => ({ sendAdminAlert: sendAdminAlertMock }));

import { finishCronRun, runBatch } from "./_auth";

beforeEach(() => {
  sendAdminAlertMock.mockClear();
});

describe("finishCronRun (WS6.5)", () => {
  it("returns 500 and alerts admin when every item failed", async () => {
    const res = await finishCronRun("weekly-artist-digest", { succeeded: 0, failed: 4 }, { failed: 4 });
    // Fail-before: this was a 200, so Vercel's cron dashboard showed green.
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failed: 4 });
    expect(sendAdminAlertMock).toHaveBeenCalledTimes(1);
    const alert = sendAdminAlertMock.mock.calls[0]![0] as { idempotencyKey: string; subject: string };
    // Day-bucketed key: a same-day manual re-run does not send a second copy,
    // tomorrow's still-broken run does.
    expect(alert.idempotencyKey).toBe(
      `cron_all_failed:weekly-artist-digest:${new Date().toISOString().slice(0, 10)}`,
    );
    expect(alert.subject).toContain("weekly-artist-digest");
  });

  it("keeps partial failure at 200 with counts, and does not alert", async () => {
    const res = await finishCronRun("onboarding-nudges", { succeeded: 3, failed: 2 }, { succeeded: 3, failed: 2 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, succeeded: 3, failed: 2 });
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("treats an empty run as healthy", async () => {
    const res = await finishCronRun("qr-scan-digest", { succeeded: 0, failed: 0 }, { sent: 0 });
    expect(res.status).toBe(200);
    expect(sendAdminAlertMock).not.toHaveBeenCalled();
  });

  it("still returns the 500 when the alert itself cannot send", async () => {
    sendAdminAlertMock.mockRejectedValueOnce(new Error("resend down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await finishCronRun("inactive-users", { succeeded: 0, failed: 1 }, {});
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("runBatch", () => {
  it("counts successes and failures per item without aborting", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runBatch([1, 2, 3], async (n) => {
      if (n === 2) throw new Error("bad row");
    });
    expect(result).toEqual({ succeeded: 2, failed: 1 });
    errorSpy.mockRestore();
  });
});
