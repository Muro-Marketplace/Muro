// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";

const authFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  authFetch: (...args: unknown[]) => authFetchMock(...args),
}));

import { useNotificationPrefs } from "./use-notification-prefs";

const mockUser = { id: "u1" } as unknown as Parameters<typeof useNotificationPrefs>[0];

beforeEach(() => {
  authFetchMock.mockReset();
});

afterEach(() => cleanup());

describe("useNotificationPrefs", () => {
  it("fetches and seeds prefs from the API on mount", async () => {
    authFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        preferences: {
          email_digest_enabled: false,
          message_notifications_enabled: true,
          order_notifications_enabled: false,
        },
      }),
    });

    const { result } = renderHook(() => useNotificationPrefs(mockUser));

    await waitFor(() => {
      expect(result.current.prefs.email_digest_enabled).toBe(false);
    });
    expect(authFetchMock).toHaveBeenCalledWith("/api/account/preferences");
    expect(result.current.prefs.message_notifications_enabled).toBe(true);
    expect(result.current.prefs.order_notifications_enabled).toBe(false);
  });

  it("does not fetch until a user is supplied", () => {
    renderHook(() => useNotificationPrefs(null));
    expect(authFetchMock).not.toHaveBeenCalled();
  });

  it("togglePref PATCHes the new value and updates state optimistically", async () => {
    // Initial GET resolves with defaults.
    authFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        preferences: {
          email_digest_enabled: true,
          message_notifications_enabled: true,
          order_notifications_enabled: true,
        },
      }),
    });
    // PATCH resolves successfully.
    authFetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    const { result } = renderHook(() => useNotificationPrefs(mockUser));

    await waitFor(() =>
      expect(result.current.prefs.email_digest_enabled).toBe(true),
    );

    await act(async () => {
      await result.current.togglePref("email_digest_enabled");
    });

    expect(result.current.prefs.email_digest_enabled).toBe(false);
    const patchCall = authFetchMock.mock.calls[1];
    expect(patchCall?.[0]).toBe("/api/account/preferences");
    expect(patchCall?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(patchCall?.[1]?.body as string)).toEqual({
      email_digest_enabled: false,
    });
  });

  it("reverts the optimistic update when the PATCH fails", async () => {
    authFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        preferences: {
          email_digest_enabled: true,
          message_notifications_enabled: true,
          order_notifications_enabled: true,
        },
      }),
    });
    authFetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useNotificationPrefs(mockUser));

    await waitFor(() =>
      expect(result.current.prefs.email_digest_enabled).toBe(true),
    );

    await act(async () => {
      await result.current.togglePref("email_digest_enabled");
    });

    expect(result.current.prefs.email_digest_enabled).toBe(true);
    expect(result.current.error).toMatch(/could not save/i);
  });
});
