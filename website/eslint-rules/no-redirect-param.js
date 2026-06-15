"use strict";

/**
 * wallplace/no-redirect-param
 *
 * Two checks that prevent re-introducing the divergent redirect pattern
 * canonicalised by ADR 0002 / Task 4.1:
 *
 *   (a) Any string literal (or template literal quasi) whose value contains
 *       the exact substring "?redirect=" is an error. The canonical param is
 *       "?next="; "?redirect=" is back-compat-read-only at the login page
 *       and must never appear as a generated URL in production code.
 *       ".get("redirect")" — a bare param name with no "?...=" — is fine and
 *       is NOT flagged.
 *
 *   (b) In signup pages (files under src/app/(pages)/signup/), a Property
 *       whose key is `next` and whose value is a string Literal is an error.
 *       Hardcoded destinations bypass the inbound ?next= that the signup flow
 *       must forward via safeRedirect(). A `next:` whose value is an
 *       identifier or expression — e.g. `next: postSignupNext` or
 *       `next: safeRedirect(x, "/apply")` — is correct and is NOT flagged.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid ?redirect= in generated URLs (canonical param is ?next=, ADR 0002) and " +
        "forbid hardcoded `next:` string-literal destinations in signup pages " +
        "(forward the inbound ?next= via safeRedirect instead, ADR 0002).",
    },
    schema: [],
    messages: {
      redirectParam:
        "Use the canonical ?next= redirect param, not ?redirect= (see ADR 0002, src/lib/safe-redirect.ts).",
      hardcodedNext:
        "Do not hardcode a next: destination in signup pages; " +
        "forward the inbound ?next= via safeRedirect() (ADR 0002).",
    },
  },

  create(context) {
    const fn = (context.filename || context.getFilename()).replace(/\\/g, "/");

    // Exempt test files from both checks — we test the rule itself in
    // RuleTester, not via the production linting pass.
    if (/\.test\.[jt]sx?$/.test(fn)) return {};

    // Is this file inside the signup subtree?
    const isSignupFile = fn.includes("src/app/(pages)/signup/");

    /**
     * Returns true if the given string value contains the exact forbidden
     * substring "?redirect=".  We match precisely so that:
     *   - "/login?redirect=/foo"           → flagged
     *   - `…?redirect=${x}`               → flagged (quasi check handles this)
     *   - params.get("redirect")           → NOT flagged (no leading "?")
     *   - // comment about ?redirect=      → NOT flagged (not a Literal node)
     */
    function containsRedirectParam(value) {
      return typeof value === "string" && value.includes("?redirect=");
    }

    return {
      // --- check (a): ?redirect= in any string literal --------------------

      Literal(node) {
        if (containsRedirectParam(node.value)) {
          context.report({ node, messageId: "redirectParam" });
        }
      },

      TemplateLiteral(node) {
        // Each quasi (the fixed string parts between ${…}) may contain the
        // forbidden substring even if the full template isn't a constant.
        if (!node.quasis) return;
        for (const quasi of node.quasis) {
          if (
            quasi &&
            quasi.value &&
            containsRedirectParam(quasi.value.cooked ?? quasi.value.raw)
          ) {
            context.report({ node: quasi, messageId: "redirectParam" });
          }
        }
      },

      // --- check (b): hardcoded `next:` in signup pages -------------------

      Property(node) {
        if (!isSignupFile) return;

        // Guard: skip computed properties — `[expr]: value` can't be the
        // literal key `next` so there's nothing useful to check.
        if (!node || node.computed) return;

        // Key must be the identifier `next` or the string literal "next".
        const key = node.key;
        if (!key) return;
        const keyName =
          key.type === "Identifier"
            ? key.name
            : key.type === "Literal" && typeof key.value === "string"
              ? key.value
              : null;

        if (keyName !== "next") return;

        // Value must be a string Literal.  Identifiers, call expressions,
        // template literals, etc. are fine and must NOT be flagged.
        const val = node.value;
        if (val && val.type === "Literal" && typeof val.value === "string") {
          context.report({ node, messageId: "hardcodedNext" });
        }
      },
    };
  },
};
