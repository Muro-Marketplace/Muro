"use strict";

/**
 * Forbid using `authFetch` for a mutating request. Use `mutate` instead.
 *
 * The whole E43 family is one defect: `authFetch` returns the raw Response and
 * RESOLVES on a non-2xx rather than throwing. So a mutating call written as
 *
 *     const res = await authFetch("/api/x", { method: "PATCH", body });
 *     // no res.ok check
 *     showToast("Saved");                       // fires on a 403/500 too
 *
 * reports success for a write that never happened. Instances found by hand:
 * placement status fired the cross-portal event on both portals on a rejected
 * change (E43-a), the withdraw-offer toast fired regardless (E43-b), "Mark
 * fulfilled" swallowed the failure (E43-c). The list was written by reading, and
 * a read finds roughly half the surface (supervisor D67).
 *
 * `mutate<T>()` from @/lib/api-client is the fix: it throws ApiError on a non-2xx
 * and NetworkError when the request never lands, so the success path only runs
 * when the server actually accepted the write. This rule makes every remaining
 * `authFetch` mutation loud so the migration can be driven to zero.
 *
 * Staged rollout, exactly like require-authz-on-mutation and the phantom-column
 * guard: land at "warn" with a grandfathered ratchet
 * (tests/integration/authfetch-mutation-ratchet.test.ts) that can only shrink;
 * flip to "error" in eslint.config.mjs when the ratchet reaches zero.
 *
 * Deliberate limits, so nobody mistakes this for a proof:
 *   - Only a STRING-LITERAL method is flagged. `authFetch(url, opts)` where the
 *     options are a variable, or `{ method }` where the method is computed, sails
 *     past — the AST cannot see the verb. Those are rare in this codebase (every
 *     mutating call writes `method: "PATCH"` inline) and the ratchet count is the
 *     backstop against a new one.
 *   - GET / HEAD and an options object with no `method` are reads; not flagged.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Use mutate() from @/lib/api-client for mutating requests, not authFetch. " +
        "authFetch resolves on non-2xx (it does not throw), so a mutation written " +
        "with it reports success on a 403/500 (the E43 false-success class).",
    },
    schema: [],
    messages: {
      authFetchMutation:
        "Don't use authFetch for a {{method}} mutation: authFetch resolves on a " +
        "non-2xx response, so the success path runs even when the write is rejected " +
        "(the E43 false-success class). Use mutate() from @/lib/api-client, which " +
        "throws ApiError on a non-2xx and NetworkError when the request never lands.",
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename() || "").replace(/\\/g, "/");

    // Test files build deliberately-bad snippets to assert they are refused.
    if (/\.test\.[cm]?[jt]sx?$/.test(filename)) return {};

    const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

    /** The string value of an object's `method` property, upper-cased, or null. */
    function literalMethod(objectExpression) {
      if (!objectExpression || objectExpression.type !== "ObjectExpression") return null;
      for (const prop of objectExpression.properties) {
        if (prop.type !== "Property") continue;
        const key = prop.key;
        const keyName =
          key.type === "Identifier" ? key.name : key.type === "Literal" ? key.value : null;
        if (keyName !== "method") continue;
        const value = prop.value;
        if (value.type === "Literal" && typeof value.value === "string") {
          return value.value.toUpperCase();
        }
        return null; // method present but not a string literal — can't judge.
      }
      return null;
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "authFetch") return;
        const options = node.arguments[1];
        const method = literalMethod(options);
        if (method && MUTATING.has(method)) {
          context.report({ node, messageId: "authFetchMutation", data: { method } });
        }
      },
    };
  },
};
