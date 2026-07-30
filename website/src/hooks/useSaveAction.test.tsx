// @vitest-environment jsdom
// 05 §1.2. The shared save control. Reports success ONLY on a confirmed run,
// rolls back the optimistic change and clears the unsaved-changes guard only on
// success, and blocks a double-submit before React flushes `saving`.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("@/context/ToastContext", () => ({ useToast: () => ({ showToast: showToastMock }) }));
// Stub supabase so importing api-client (for ApiError) never builds a real client.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: vi.fn() } } }));

import { useSaveAction } from "./useSaveAction";
import { ApiError } from "@/lib/api-client";

beforeEach(() => {
  showToastMock.mockReset();
});

describe("useSaveAction (05 §1.2)", () => {
  it("(a) confirmed success: resolves true, runs onSuccess + clearDirty, toasts once, saved=true", async () => {
    const run = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    const clearDirty = vi.fn();
    const { result } = renderHook(() =>
      useSaveAction({ run, onSuccess, clearDirty, successMessage: "Saved" }),
    );

    let ret: boolean | undefined;
    await act(async () => {
      ret = await result.current.save();
    });

    expect(ret).toBe(true);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(clearDirty).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledTimes(1);
    expect(showToastMock).toHaveBeenCalledWith("Saved");
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("(b) failure: rolls back the optimistic change, does NOT clearDirty, error toast, resolves false", async () => {
    const run = vi.fn().mockRejectedValue(new ApiError(403, "post_limit_reached", "post_limit_reached", {}));
    const rollback = vi.fn();
    const optimistic = vi.fn(() => rollback);
    const clearDirty = vi.fn();
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      useSaveAction({ run, optimistic, onSuccess, clearDirty, successMessage: "Saved" }),
    );

    let ret: boolean | undefined;
    await act(async () => {
      ret = await result.current.save();
    });

    expect(ret).toBe(false);
    expect(optimistic).toHaveBeenCalledTimes(1);
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    // The guard must NOT be cleared on failure — that is how "Saved" while nothing
    // saved and the dirty warning is gone happens.
    expect(clearDirty).not.toHaveBeenCalled();
    expect(showToastMock).toHaveBeenCalledWith("post_limit_reached", { variant: "error", durationMs: 5000 });
    expect(result.current.saved).toBe(false);
    expect(result.current.error).toBe("post_limit_reached");
  });

  it("(c) in-flight lock: a second save() while one is running returns false and does not re-run", async () => {
    let resolveRun: (v: unknown) => void = () => {};
    const run = vi.fn(() => new Promise((res) => { resolveRun = res; }));
    const { result } = renderHook(() => useSaveAction({ run }));

    let first: Promise<boolean> | undefined;
    let second: boolean | undefined;
    await act(async () => {
      first = result.current.save(); // starts; inFlight = true, run called once
      second = await result.current.save(); // blocked synchronously, resolves false
    });

    expect(second).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);

    // Let the first one finish; still only one run.
    await act(async () => {
      resolveRun({ ok: true });
      await first;
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
