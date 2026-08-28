// E36d — `afterResponse` exists so a route can do best-effort work (email,
// admin pings) without that work being on the response's critical path. It was
// the fresh-signup branch awaiting `sendEmail` that let response latency
// distinguish a new email from a duplicate, even once both branches returned
// the same status and body.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));
vi.mock("next/server", () => ({ after: afterMock }));

import { afterResponse } from "./after-response";

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  afterMock.mockReset();
});

describe("afterResponse in a Next request scope", () => {
  it("hands the work to next/server's after rather than running it inline", async () => {
    const task = vi.fn().mockResolvedValue(undefined);

    afterResponse(task);

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(task, "the task must not run before the response is sent").not.toHaveBeenCalled();

    // The scheduler eventually runs what it was handed.
    await afterMock.mock.calls[0][0]();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("swallows and logs a task failure instead of surfacing it to the caller", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    afterResponse(() => Promise.reject(new Error("resend is down")));

    await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("afterResponse outside a request scope", () => {
  // Route handlers invoked directly (unit tests, scripts) have no Next request
  // scope, and `after` throws there rather than deferring.
  beforeEach(() => {
    afterMock.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope.");
    });
  });

  it("still runs the work, so behaviour does not silently differ", async () => {
    const task = vi.fn().mockResolvedValue(undefined);
    expect(() => afterResponse(task)).not.toThrow();
    await tick();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("does not let a task rejection become an unhandled rejection", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => afterResponse(() => Promise.reject(new Error("boom")))).not.toThrow();
    await tick();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("afterResponse never throws into the caller", () => {
  let unhandled: unknown = null;
  const capture = (e: unknown) => { unhandled = e; };

  beforeEach(() => { unhandled = null; process.on("unhandledRejection", capture); });
  afterEach(() => { process.off("unhandledRejection", capture); });

  it("keeps a rejected task from bringing down the request", async () => {
    afterMock.mockImplementation(() => { throw new Error("no scope"); });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    afterResponse(async () => { throw new Error("nope"); });
    await tick();
    expect(unhandled).toBeNull();
    err.mockRestore();
  });
});
