// @vitest-environment jsdom
//
// The confirmation must follow the server, not the click. submitFlagAction's
// header records why: the message flag actions each set their "submitted"
// state regardless of the response, so someone could believe a harasser was
// blocked when the block never persisted. A report is the same shape of
// promise and gets the same treatment here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent, waitFor } from "@testing-library/react";

const { mutateMock, showToastMock, authMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  showToastMock: vi.fn(),
  authMock: vi.fn(),
}));

// Fully mocked, not importActual: api-client imports @/lib/supabase, which
// builds a real client at module load and throws without env.
vi.mock("@/lib/api-client", () => ({
  mutate: mutateMock,
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: authMock }));
vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));

import ReportContentButton from "./ReportContentButton";

const PROPS = { entityType: "artist_work" as const, entityId: "w-1", entityLabel: "Still Life" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockReturnValue({ user: { id: "u-1", email: "a@b.c" } });
  mutateMock.mockResolvedValue({ ok: true });
});
afterEach(() => cleanup());

function openDialog(r: ReturnType<typeof render>) {
  fireEvent.click(r.getByText("Report this"));
  return r.getByRole("dialog");
}

describe("<ReportContentButton />", () => {
  it("shows only a quiet trigger until it is opened", () => {
    const r = render(<ReportContentButton {...PROPS} />);
    expect(r.queryByRole("dialog")).toBeNull();
    expect(r.getByText("Report this")).toBeTruthy();
  });

  it("posts the entity type and id it was given, never anything from the page", async () => {
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    fireEvent.click(r.getByText("Send report"));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledTimes(1));
    const [url, init] = mutateMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/reports");
    expect(JSON.parse(String(init.body))).toEqual({
      entityType: "artist_work",
      entityId: "w-1",
      reason: "not_the_artists_own_work",
      detail: "",
    });
  });

  it("confirms ONLY after the server accepts", async () => {
    let resolve!: (v: unknown) => void;
    mutateMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    fireEvent.click(r.getByText("Send report"));
    await waitFor(() => expect(r.getByText("Sending")).toBeTruthy());
    expect(r.queryByText("Thank you")).toBeNull();
    resolve({ ok: true });
    await waitFor(() => expect(r.getByText("Thank you")).toBeTruthy());
  });

  it("shows an error and no confirmation when the server refuses", async () => {
    mutateMock.mockRejectedValue(new Error("nope"));
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    fireEvent.click(r.getByText("Send report"));
    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    expect(r.queryByText("Thank you")).toBeNull();
    expect(showToastMock.mock.calls[0][1]).toMatchObject({ variant: "error" });
  });

  it("requires a detail when the reason is 'other', because a bare 'other' tells a moderator nothing", async () => {
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    fireEvent.change(r.getByRole("combobox"), { target: { value: "other" } });
    fireEvent.click(r.getByText("Send report"));
    await waitFor(() => expect(showToastMock).toHaveBeenCalled());
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("sends the chosen reason and trimmed detail", async () => {
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    fireEvent.change(r.getByRole("combobox"), { target: { value: "impersonation" } });
    fireEvent.change(r.getByRole("textbox"), { target: { value: "  pretending to be a real gallery  " } });
    fireEvent.click(r.getByText("Send report"));
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    expect(JSON.parse(String((mutateMock.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({
      reason: "impersonation",
      detail: "pretending to be a real gallery",
    });
  });

  it("asks a signed-out visitor to sign in rather than silently failing on a NOT NULL reporter", () => {
    authMock.mockReturnValue({ user: null });
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    expect(r.getByText("Sign in")).toBeTruthy();
    expect(r.queryByText("Send report")).toBeNull();
  });

  it("offers the contact form to a signed-out visitor who does not want an account", () => {
    authMock.mockReturnValue({ user: null });
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    expect(r.getByText("contact us").getAttribute("href")).toBe("/contact");
  });

  it("closes on Escape", () => {
    const r = render(<ReportContentButton {...PROPS} />);
    openDialog(r);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(r.queryByRole("dialog")).toBeNull();
  });
});
