// B4 wiring test. access.test.ts proves the gate's env matrix; this proves both
// pages actually consult it, and that the check happens before any work.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { notFoundMock, renderMock, findTemplateMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    // The real notFound() throws to unwind the render.
    throw new Error("NEXT_NOT_FOUND");
  }),
  renderMock: vi.fn(async () => "<html></html>"),
  findTemplateMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("./EmailPreviewIndex", () => ({ default: () => null }));
vi.mock("@react-email/components", () => ({ render: renderMock }));
vi.mock("@/emails/registry", () => ({ findTemplate: findTemplateMock, EMAIL_REGISTRY: [] }));

import EmailPreviewIndexPage from "./page";
import EmailPreviewDetailPage from "./[id]/page";

const original = { ...process.env };

beforeEach(() => {
  notFoundMock.mockClear();
  renderMock.mockClear();
  findTemplateMock.mockClear();
  findTemplateMock.mockReturnValue({ component: () => null, mock: {} });
});

afterEach(() => {
  process.env = { ...original };
});

const asProduction = () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
  delete process.env.VERCEL_ENV;
};
const asLocal = () => {
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  delete process.env.VERCEL_ENV;
};

describe("/email-preview index page (B4)", () => {
  it("404s on the live site", () => {
    asProduction();
    expect(() => EmailPreviewIndexPage()).toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it("renders in local development", () => {
    asLocal();
    expect(() => EmailPreviewIndexPage()).not.toThrow();
    expect(notFoundMock).not.toHaveBeenCalled();
  });
});

describe("/email-preview/[id] detail page (B4)", () => {
  const params = Promise.resolve({ id: "customer_order_receipt" });

  it("404s on the live site without even looking up the template", async () => {
    asProduction();
    await expect(EmailPreviewDetailPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledOnce();
    // Gate first: a production request must not be able to distinguish a real
    // template id from a bogus one, and must not render one either.
    expect(findTemplateMock).not.toHaveBeenCalled();
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("renders a template in local development", async () => {
    asLocal();
    await EmailPreviewDetailPage({ params });
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(findTemplateMock).toHaveBeenCalledWith("customer_order_receipt");
    expect(renderMock).toHaveBeenCalled();
  });
});
