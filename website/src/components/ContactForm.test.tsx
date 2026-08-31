// @vitest-environment jsdom
//
// A28. Messaging an artist fires two writes: the enquiry (which is what
// actually reaches the artist) and the contact submission (the durable record
// for the team). The enquiry response was awaited and then ignored, so a
// failed enquiry alongside a successful contact insert still told the sender
// "They'll be notified by email" when nothing had reached the artist.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { useSearchParamsMock } = vi.hoisted(() => ({ useSearchParamsMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: useSearchParamsMock }));

import ContactForm from "./ContactForm";

function reply(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

/** Route each fetch by URL so the two writes can succeed or fail apart. */
function installFetch(handlers: { enquiry: () => Promise<Response>; contact: () => Promise<Response> }) {
  const spy = vi.fn(async (url: string) => {
    if (String(url).includes("/api/enquiry")) return handlers.enquiry();
    if (String(url).includes("/api/contact")) return handlers.contact();
    return reply(200, { artists: [] }); // browse-artists name lookup
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

async function submit() {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Jo Buyer" } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "jo@example.com" } });
  fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Is this still available?" } });
  fireEvent.submit(screen.getByRole("button", { name: /send message/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  // ?artist=alice, i.e. the message-an-artist variant.
  useSearchParamsMock.mockReturnValue({ get: (k: string) => (k === "artist" ? "alice" : null) });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContactForm artist messaging (A28)", () => {
  it("promises email notification only when the enquiry actually succeeded", async () => {
    installFetch({ enquiry: async () => reply(200), contact: async () => reply(200) });
    render(<ContactForm />);
    await submit();
    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeTruthy());
    expect(screen.getByText(/notified by email/i)).toBeTruthy();
  });

  it("a FAILED enquiry does not claim the artist was notified", async () => {
    installFetch({ enquiry: async () => reply(500, { error: "boom" }), contact: async () => reply(200) });
    render(<ContactForm />);
    await submit();
    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeTruthy());
    expect(screen.queryByText(/notified by email/i)).toBeNull();
    expect(screen.getByText(/could not notify them automatically/i)).toBeTruthy();
  });

  it("a thrown enquiry request is treated the same as a failed one", async () => {
    installFetch({
      enquiry: async () => { throw new Error("offline"); },
      contact: async () => reply(200),
    });
    render(<ContactForm />);
    await submit();
    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeTruthy());
    expect(screen.queryByText(/notified by email/i)).toBeNull();
  });

  it("a failed CONTACT write still surfaces an error rather than a success screen", async () => {
    installFetch({
      enquiry: async () => reply(200),
      contact: async () => reply(500, { error: "Something went wrong" }),
    });
    render(<ContactForm />);
    await submit();
    await waitFor(() => expect(screen.getByText(/something went wrong/i)).toBeTruthy());
    expect(screen.queryByText(/message sent/i)).toBeNull();
  });
});

// A2.3. /api/contact mints a reference, writes it to the row and prints it in
// the acknowledgement email, but the response carried only { success }. Anyone
// whose acknowledgement never arrived, or who closed it, was invited to quote
// a reference they had never been shown.
describe("ContactForm shows the reference it was given (A2.3)", () => {
  it("displays the reference on the success screen", async () => {
    installFetch({
      enquiry: async () => reply(200),
      contact: async () => reply(200, { success: true, reference: "WP-ABC123" }),
    });
    render(<ContactForm />);
    await submit();

    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeTruthy());
    expect(screen.getByText("WP-ABC123")).toBeTruthy();
  });

  it("still confirms the send when no reference comes back", async () => {
    // Any response that drops the field must not take the confirmation with it.
    installFetch({
      enquiry: async () => reply(200),
      contact: async () => reply(200, { success: true }),
    });
    render(<ContactForm />);
    await submit();

    await waitFor(() => expect(screen.getByText(/message sent/i)).toBeTruthy());
    expect(screen.queryByText(/Your reference is/)).toBeNull();
  });
});
