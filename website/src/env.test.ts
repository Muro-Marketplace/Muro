// serverEnv()/publicEnv() are the boot-time gate. Test the contract: missing
// required vars throw clearly; optional vars stay optional; the cache returns
// the same object across calls so we don't re-parse every request.

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("env, server", () => {
  beforeEach(() => {
    // Each test gets a fresh module so the internal `_server` cache starts
    // empty, otherwise the first successful parse sticks and later tests
    // with different process.env shapes see stale values.
    vi.resetModules();
  });

  async function freshEnv() {
    return await import("./env");
  }

  it("throws a clear error listing missing required vars", async () => {
    const snap = { ...process.env };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { serverEnv } = await freshEnv();
      expect(() => serverEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    } finally {
      Object.assign(process.env, snap);
    }
  });

  it("accepts a valid environment", async () => {
    const snap = { ...process.env };
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOi_abc_test_key_mock";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOi_svc_test_key_mock";
      process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
      const { serverEnv } = await freshEnv();
      const env = serverEnv();
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
      expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://wallplace.co.uk");
    } finally {
      Object.assign(process.env, snap);
    }
  });

  it("rejects a malformed STRIPE_SECRET_KEY (must start with sk_)", async () => {
    const snap = { ...process.env };
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOi_MOCK_ANON_KEY_20CHARS";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOi_MOCK_SVC_KEY_20CHARS";
      process.env.STRIPE_SECRET_KEY = "bogus"; // not sk_
      const { serverEnv } = await freshEnv();
      expect(() => serverEnv()).toThrow(/STRIPE_SECRET_KEY/);
    } finally {
      Object.assign(process.env, snap);
    }
  });

  it("publicEnv exposes only NEXT_PUBLIC_ vars", async () => {
    const snap = { ...process.env };
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOi_MOCK_ANON_KEY_20CHARS";
      process.env.NEXT_PUBLIC_SITE_URL = "https://wallplace.co.uk";
      // Even with SERVICE_ROLE unset, publicEnv should succeed.
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { publicEnv } = await freshEnv();
      const pub = publicEnv();
      expect(pub.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
      expect(Object.keys(pub)).toEqual(
        expect.arrayContaining([
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "NEXT_PUBLIC_SITE_URL",
        ]),
      );
      // Service role must not leak through publicEnv
      expect((pub as Record<string, unknown>).SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    } finally {
      Object.assign(process.env, snap);
    }
  });
});
