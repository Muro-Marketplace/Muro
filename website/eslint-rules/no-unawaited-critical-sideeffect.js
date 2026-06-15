"use strict";

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid fire-and-forget of critical side-effects (executeTransfer or notify*) in API routes. " +
        "A call that is not awaited at statement level can be silently dropped on serverless when the " +
        "function returns. Await it (or enqueue via Inngest) to guarantee execution.",
    },
    schema: [],
    messages: {
      unawaited:
        "Critical side-effect (executeTransfer or notify*) is not awaited at statement level; " +
        "on serverless the function may return before it runs and silently drop it. " +
        "await it (or enqueue via Inngest).",
    },
  },

  create(context) {
    const fn = (context.filename || context.getFilename()).replace(/\\/g, "/");
    // Only apply inside API route files.
    if (!fn.includes("/src/app/api/")) return {};
    // Skip test files — lint serverless-safety in production code, not test mocks.
    if (/\.test\.[jt]sx?$/.test(fn)) return {};

    /**
     * Resolve the callee name from an Identifier or a non-computed
     * MemberExpression. Returns undefined for anything we can't safely
     * inspect (optional chain, computed property, etc.) so the rule
     * false-negatives rather than crashing.
     */
    function resolveName(node) {
      if (!node) return undefined;
      // Unwrap ChainExpression (optional chaining ?.): `foo?.bar()`
      if (node.type === "ChainExpression") return undefined;
      if (node.type === "Identifier") return node.name;
      if (
        node.type === "MemberExpression" &&
        !node.computed &&
        node.property.type === "Identifier"
      ) {
        return node.property.name;
      }
      return undefined;
    }

    function isDenylisted(name) {
      return name === "executeTransfer" || /^notify/.test(name);
    }

    return {
      ExpressionStatement(node) {
        const expr = node.expression;

        // Already awaited — fine.
        if (expr.type === "AwaitExpression") return;

        // Only care about call expressions at statement level.
        if (expr.type !== "CallExpression") return;

        // Guard: callee must be safely inspectable.
        if (!expr.callee) return;

        const calleeName = resolveName(expr.callee);

        // Case (i): bare denylisted call — `notifyX(...)` or `executeTransfer(...)`
        if (calleeName !== undefined && isDenylisted(calleeName)) {
          context.report({ node: expr, messageId: "unawaited" });
          return;
        }

        // Case (ii): chained call on a denylisted call — `notifyX(...).catch(...)`
        // or `notifyX(...).then(...)`.
        // The callee must be a non-computed MemberExpression whose property
        // is "catch" or "then", and whose object is a CallExpression resolving
        // to a denylisted name.
        if (
          expr.callee.type === "MemberExpression" &&
          !expr.callee.computed &&
          expr.callee.property.type === "Identifier" &&
          (expr.callee.property.name === "catch" || expr.callee.property.name === "then")
        ) {
          const obj = expr.callee.object;
          if (obj && obj.type === "CallExpression") {
            const innerName = resolveName(obj.callee);
            if (innerName !== undefined && isDenylisted(innerName)) {
              context.report({ node: expr, messageId: "unawaited" });
            }
          }
        }
      },
    };
  },
};
