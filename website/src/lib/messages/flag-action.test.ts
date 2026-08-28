// 05 E43-e. The Report / Delete / Block actions in the message flag popup used
// to set their "submitted" confirmation regardless of the response (authFetch
// resolves on a non-2xx; the catch swallowed network errors). Block was the
// worst: "User blocked" showed even when the block never persisted.
// submitFlagAction sets the confirmation ONLY after mutate() resolves.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ mutate: mutateMock }));

import { submitFlagAction } from "./flag-action";

function harness() {
  return {
    setSubmitting: vi.fn(),
    setSubmitted: vi.fn(),
    showToast: vi.fn(),
  };
}

// Block body (not `() => mutateMock.mockReset()`): an expression-body arrow
// returns the mock, and vitest registers a function returned from a hook as a
// teardown callback — so it would call the mock as cleanup after each test, and
// the throwing test's mock would throw during teardown.
beforeEach(() => {
  mutateMock.mockReset();
});

describe("submitFlagAction (E43-e)", () => {
  it("on success: sets the outcome, shows no error, toggles submitting off, returns true", async () => {
    mutateMock.mockResolvedValue({ ok: true });
    const h = harness();

    const ok = await submitFlagAction({
      url: "/api/messages/block",
      method: "POST",
      body: { otherParty: "artist:1" },
      outcome: "blocked",
      errorMessage: "Could not block this user. Please try again.",
      ...h,
    });

    expect(ok).toBe(true);
    expect(h.setSubmitted).toHaveBeenCalledWith("blocked");
    expect(h.showToast).not.toHaveBeenCalled();
    expect(h.setSubmitting).toHaveBeenNthCalledWith(1, true);
    expect(h.setSubmitting).toHaveBeenLastCalledWith(false);
  });

  it("on a rejected block (ApiError): does NOT set the outcome, shows an error, returns false", async () => {
    mutateMock.mockRejectedValue(new Error("403 forbidden"));
    const h = harness();

    const ok = await submitFlagAction({
      url: "/api/messages/block",
      method: "POST",
      body: { otherParty: "artist:1" },
      outcome: "blocked",
      errorMessage: "Could not block this user. Please try again.",
      ...h,
    });

    // Fail-before: the old handler set setFlagSubmitted("blocked") regardless, so
    // the user was told a harasser was blocked when the block never landed.
    expect(ok).toBe(false);
    expect(h.setSubmitted).not.toHaveBeenCalled();
    expect(h.showToast).toHaveBeenCalledWith(
      "Could not block this user. Please try again.",
      { variant: "error" },
    );
    // Submitting is still cleared (finally).
    expect(h.setSubmitting).toHaveBeenLastCalledWith(false);
  });

  it("sends the given method and JSON-stringifies the body", async () => {
    mutateMock.mockResolvedValue({});
    const h = harness();
    await submitFlagAction({
      url: "/api/messages",
      method: "DELETE",
      body: { conversationId: "c1" },
      outcome: "deleted",
      errorMessage: "x",
      ...h,
    });
    expect(mutateMock).toHaveBeenCalledWith("/api/messages", {
      method: "DELETE",
      body: JSON.stringify({ conversationId: "c1" }),
    });
  });
});
