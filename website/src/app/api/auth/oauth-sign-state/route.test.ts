// E35d — this unauthenticated route minted a validly HMAC-signed state token
// for whatever role the body asked for, validated against `isRole`, which
// accepts "admin". The whole OAuth flow trusts that token downstream, so
// `POST {"role":"admin"}` was a signed claim to be an admin, for free.

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { POST } from "./route";
import { verifyOAuthState } from "@/lib/oauth-state";

function post(body: unknown): Request {
  return new Request("http://localhost/api/auth/oauth-sign-state", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

let savedSecret: string | undefined;

beforeEach(() => {
  savedSecret = process.env.OAUTH_STATE_SECRET;
  process.env.OAUTH_STATE_SECRET = "test-secret-for-oauth-state";
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.OAUTH_STATE_SECRET;
  else process.env.OAUTH_STATE_SECRET = savedSecret;
});

describe("POST /api/auth/oauth-sign-state (E35d)", () => {
  it("refuses to mint a state token claiming admin", async () => {
    const res = await POST(post({ role: "admin", next: "/admin" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid role" });
  });

  it("refuses case variants too", async () => {
    for (const role of ["Admin", "ADMIN"]) {
      expect((await POST(post({ role }))).status, role).toBe(400);
    }
  });

  it("still mints for the three roles a person can sign up as", async () => {
    for (const role of ["artist", "venue", "customer"]) {
      const res = await POST(post({ role, next: "/browse" }));
      expect(res.status, role).toBe(200);
      const { state } = await res.json();
      // The minted token really does carry the role asked for.
      await expect(verifyOAuthState(state)).resolves.toMatchObject({ role });
    }
  });

  it("still sanitises the next path", async () => {
    const res = await POST(post({ role: "artist", next: "//evil.example" }));
    const { state } = await res.json();
    await expect(verifyOAuthState(state)).resolves.toMatchObject({ next: "/browse" });
  });

  it("still rejects a body that is not JSON", async () => {
    const bad = new Request("http://localhost/api/auth/oauth-sign-state", {
      method: "POST",
      body: "not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });
});
