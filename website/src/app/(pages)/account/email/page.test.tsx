// @vitest-environment jsdom
// Launch audit 2026-09-05, email preferences hub. Two defects, each pinned in
// its own block: a non-2xx answer on load left "Loading your preferences…" on
// screen indefinitely (LA-C053), and a failed save left the toggle in its new,
// unsaved position (LA-C054).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// One auth object for the file: the page lists `user` in its effect deps.
const { authFetchMock, mutateMock, AUTH } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
  mutateMock: vi.fn(),
  AUTH: { user: { id: "u1", email: "u@example.com" }, loading: false },
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => AUTH }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock, mutate: mutateMock }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import EmailPreferencesPage from "./page";

const PREFS = {
  placements_enabled: true,
  messages_enabled: true,
  digests_enabled: true,
  recommendations_enabled: true,
  tips_enabled: true,
  newsletter_enabled: false,
  promotions_enabled: false,
  digest_frequency: "weekly",
  vacation_until: null,
};

afterEach(() => cleanup());
beforeEach(() => {
  authFetchMock.mockReset();
  mutateMock.mockReset();
});

describe("email preferences load (LA-C053)", () => {
  it("shows the load error on a non-2xx answer instead of loading forever", async () => {
    authFetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
    render(<EmailPreferencesPage />);
    expect(await screen.findByText(/could not load your preferences/i)).toBeTruthy();
    expect(screen.queryByText(/Loading your preferences/)).toBeNull();
  });
});

describe("email preferences save (LA-C054)", () => {
  it("puts a toggle back when the save fails, and says so", async () => {
    authFetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ preferences: PREFS }) });
    mutateMock.mockRejectedValue(new Error("boom"));
    render(<EmailPreferencesPage />);
    const box = (await screen.findAllByRole("checkbox"))[0] as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByText("Could not save. Try again.")).toBeTruthy());
    await waitFor(() => expect(box.checked).toBe(true));
  });
});
