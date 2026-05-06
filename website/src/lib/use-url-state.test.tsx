// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock next/navigation. The replace mock captures URL writes per test.
const replaceMock = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => "/test-path",
}));

import { useUrlState } from "./use-url-state";

describe("useUrlState", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    currentSearch = "";
  });

  type Tab = "works" | "artists" | "collections";

  it("hydrates from the URL when param is present", () => {
    currentSearch = "?tab=artists";
    const { result } = renderHook(() => useUrlState<Tab>("tab", "works"));
    expect(result.current[0]).toBe("artists");
  });

  it("falls back to defaultValue when param is absent", () => {
    currentSearch = "";
    const { result } = renderHook(() => useUrlState<Tab>("tab", "works"));
    expect(result.current[0]).toBe("works");
  });

  it("setting a value writes to URL via router.replace", () => {
    currentSearch = "";
    const { result } = renderHook(() => useUrlState<Tab>("tab", "works"));
    act(() => result.current[1]("artists"));
    expect(replaceMock).toHaveBeenCalledWith("/test-path?tab=artists");
  });

  it("setting back to default value removes the param from URL", () => {
    currentSearch = "?tab=artists";
    const { result } = renderHook(() => useUrlState<Tab>("tab", "works"));
    act(() => result.current[1]("works"));
    expect(replaceMock).toHaveBeenCalledWith("/test-path");
  });

  it("preserves other unrelated params when writing", () => {
    currentSearch = "?other=keep&tab=artists";
    const { result } = renderHook(() => useUrlState<Tab>("tab", "works"));
    act(() => result.current[1]("collections"));
    expect(replaceMock).toHaveBeenCalledWith("/test-path?other=keep&tab=collections");
  });

  it("setting back to default value with other params keeps the others", () => {
    currentSearch = "?other=keep&tab=artists";
    const { result } = renderHook(() => useUrlState<Tab>("tab", "works"));
    act(() => result.current[1]("works"));
    expect(replaceMock).toHaveBeenCalledWith("/test-path?other=keep");
  });
});
