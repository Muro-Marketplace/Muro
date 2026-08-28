// @vitest-environment jsdom
//
// A37/H10 — the demo portal tour could not sign anyone in. The old flow
// linked straight to /api/demo/login, which set httpOnly sb-* cookies that
// nothing in this app reads (plain supabase-js, localStorage sessions, no
// @supabase/ssr middleware), so the visitor bounced to /login. These tests
// pin the working client half: POST for the tokens, setSession on the
// shared client, then navigate to the vetted destination; with the Phase 1
// public-profile fallback and an honest error state on failure.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push, setSessionMock } = vi.hoisted(() => ({
  push: vi.fn(),
  setSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { setSession: setSessionMock } },
}));

vi.mock("next/link", () => ({
  // `prefetch` is a next/link prop, not a DOM attribute; strip it so the
  // plain <a> stand-in doesn't warn.
  default: ({ href, children, prefetch, ...rest }: { href: string; children: React.ReactNode; prefetch?: boolean; [k: string]: unknown }) => {
    void prefetch;
    return <a href={href} {...rest}>{children}</a>;
  },
}));

import DemoTourCard from "./DemoTourCard";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  push.mockReset();
  setSessionMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function renderCard(overrides: Partial<React.ComponentProps<typeof DemoTourCard>> = {}) {
  return render(
    <DemoTourCard
      role="artist"
      enabled
      fallbackHref="/browse/maya-chen"
      className="card"
      {...overrides}
    >
      Tour the artist account
    </DemoTourCard>,
  );
}

describe("DemoTourCard when the portal tour is disabled", () => {
  it("renders a plain link to the public profile", () => {
    renderCard({ enabled: false });
    const link = screen.getByRole("link", { name: /tour the artist account/i });
    expect(link.getAttribute("href")).toBe("/browse/maya-chen");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("DemoTourCard when the portal tour is enabled", () => {
  it("fetches tokens, sets the session on the shared client, then navigates", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        configured: true,
        role: "artist",
        redirectTo: "/artist-portal",
        access_token: "at",
        refresh_token: "rt",
      }),
    );
    setSessionMock.mockResolvedValue({ data: {}, error: null });

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /tour the artist account/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/artist-portal"));
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/login?role=artist", {
      method: "POST",
    });
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
  });

  it("falls back to the public profile on a 503 (demo account not configured)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { error: "Demo account not configured", configured: false, role: "artist" }),
    );

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /tour the artist account/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/browse/maya-chen"));
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows an honest error with a public-profile escape hatch when the API fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { error: "Could not start demo session.", configured: true, role: "artist" }),
    );

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /tour the artist account/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't start the demo tour just now");
    const escapeHatch = screen.getByRole("link", { name: /view the public profile/i });
    expect(escapeHatch.getAttribute("href")).toBe("/browse/maya-chen");
    expect(push).not.toHaveBeenCalled();
    expect(setSessionMock).not.toHaveBeenCalled();
  });

  it("shows the error state when setSession rejects the tokens", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        configured: true,
        role: "artist",
        redirectTo: "/artist-portal",
        access_token: "at",
        refresh_token: "rt",
      }),
    );
    setSessionMock.mockResolvedValue({ data: {}, error: { message: "bad token" } });

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /tour the artist account/i }));

    await screen.findByRole("alert");
    expect(push).not.toHaveBeenCalled();
  });

  it("never navigates off-site even if the response body is malformed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        configured: true,
        role: "artist",
        redirectTo: "https://evil.example/phish",
        access_token: "at",
        refresh_token: "rt",
      }),
    );
    setSessionMock.mockResolvedValue({ data: {}, error: null });

    renderCard();
    await userEvent.click(screen.getByRole("button", { name: /tour the artist account/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/artist-portal"));
  });

  it("uses the venue portal default for role=venue", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        configured: true,
        role: "venue",
        redirectTo: "/venue-portal",
        access_token: "at",
        refresh_token: "rt",
      }),
    );
    setSessionMock.mockResolvedValue({ data: {}, error: null });

    renderCard({ role: "venue", fallbackHref: "/venues/the-copper-kettle" });
    await userEvent.click(screen.getByRole("button", { name: /tour the artist account/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/venue-portal"));
    expect(fetchMock).toHaveBeenCalledWith("/api/demo/login?role=venue", {
      method: "POST",
    });
  });
});
