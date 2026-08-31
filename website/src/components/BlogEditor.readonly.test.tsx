// @vitest-environment jsdom
//
// QA 2026-08-30 bug 16: a published post rendered a complete, working-looking
// editor with no save control of any kind, and silently discarded every edit
// on navigation. The fields now follow the same rule as the buttons and say why.

import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/lib/api-client", () => ({
  authFetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  mutate: vi.fn(async () => ({})),
  ApiError: class extends Error {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import BlogEditor from "./BlogEditor";

afterEach(cleanup);

const base = {
  blogId: "b-1",
  initialTitle: "teest",
  initialBody: "Some body copy.",
  initialCover: null,
  initialFeatured: [],
};

describe("a published post is honestly read-only", () => {
  it("disables the fields and explains why, instead of discarding edits", () => {
    render(<BlogEditor {...base} status="published" />);

    expect(screen.getByText(/published, so it cannot be edited here/i)).toBeTruthy();
    const title = screen.getByDisplayValue("teest") as HTMLInputElement;
    expect(title.disabled).toBe(true);
    const body = screen.getByDisplayValue("Some body copy.") as HTMLTextAreaElement;
    expect(body.disabled).toBe(true);
  });

  it("says something different, and equally true, while a post is in review", () => {
    render(<BlogEditor {...base} status="pending_review" />);
    expect(screen.getByText(/with the Wallplace team for review/i)).toBeTruthy();
  });

  it("leaves a draft fully editable", () => {
    render(<BlogEditor {...base} status="draft" />);
    const title = screen.getByDisplayValue("teest") as HTMLInputElement;
    expect(title.disabled).toBe(false);
    expect(screen.queryByText(/cannot be edited/i)).toBeNull();
    expect(screen.getByRole("button", { name: /submit for review/i })).toBeTruthy();
  });
});
