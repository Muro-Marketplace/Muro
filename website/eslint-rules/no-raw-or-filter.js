"use strict";

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid building a PostgREST .or() filter from a raw interpolated template literal. " +
        "Use orFilter() from @/lib/db/safe-filter instead.",
    },
    schema: [],
    messages: {
      rawOrFilter:
        "Build .or() filters with orFilter() from @/lib/db/safe-filter. " +
        "A raw interpolated template literal can inject extra PostgREST filter terms.",
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        // Must be a member call: <expr>.or(...)
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "or"
        ) {
          return;
        }

        const arg = node.arguments[0];

        // Only flag TemplateLiterals that contain at least one expression (${...}).
        // Static strings (.or("...")) are safe. Non-template args (CallExpression,
        // Identifier, etc.) are also safe — they're something like orFilter([...])
        // or z.literal("").
        if (!arg || arg.type !== "TemplateLiteral" || arg.expressions.length === 0) {
          return;
        }

        // Exempt group expressions. Join the static quasis and check for
        // nested PostgREST group-expression keywords that cannot be
        // expressed by orFilter(). If any are present this is a structured
        // group call, not a flat comma-separated term list.
        const staticText = arg.quasis.map((q) => q.value.raw).join("");
        if (
          staticText.includes("and(") ||
          staticText.includes("or(") ||
          staticText.includes("not(")
        ) {
          return;
        }

        context.report({ node, messageId: "rawOrFilter" });
      },
    };
  },
};
