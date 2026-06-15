"use strict";

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid re-implementing an inline daily outreach counter on the placements or messages table. " +
        "The canonical aggregation is checkArtistOutreachCap() in src/lib/outreach-cap.ts. " +
        "Siloed inline counters let artists exceed the real cap by spreading outreach across surfaces.",
    },
    schema: [],
    messages: {
      adHocCap:
        "Daily outreach counting belongs in checkArtistOutreachCap() (src/lib/outreach-cap.ts). " +
        "Do not re-implement an inline placements/messages daily counter.",
    },
  },

  create(context) {
    const fn = (context.filename || context.getFilename()).replace(/\\/g, "/");

    // The helper file itself is the canonical home — always exempt.
    if (fn.endsWith("src/lib/outreach-cap.ts")) return {};

    // Test files — lint production code, not test harness mocks.
    if (/\.test\.[jt]sx?$/.test(fn)) return {};

    // Cron routes use placements/messages + gte(created_at) + count legitimately
    // for digest-email analytics (weekly views, pending request counts, etc.).
    // They are never guarding an artist outreach cap, so exempt them.
    // Match both absolute paths (/project/src/app/api/cron/…) and relative
    // paths (src/app/api/cron/…) as ESLint may receive either form.
    if (fn.includes("src/app/api/cron/")) return {};

    /**
     * Walk up the fluent chain rooted at `node`.
     * Returns a list of method names (strings) called on the chain, in order
     * from innermost to outermost.  Bails and returns undefined if the chain
     * includes optional chaining or a computed member expression.
     */
    function collectChainMethods(startNode) {
      const methods = [];
      let cursor = startNode;

      // Walk upward: cursor is a CallExpression; its parent is a
      // MemberExpression (.method) whose parent is the next CallExpression
      // in the chain.
      while (true) {
        const memberParent = cursor.parent;
        // Safety: bail on optional chaining or anything that's not a plain
        // MemberExpression whose object is exactly our current cursor.
        if (
          !memberParent ||
          memberParent.type !== "MemberExpression" ||
          memberParent.computed ||
          memberParent.object !== cursor ||
          memberParent.property.type !== "Identifier"
        ) {
          break;
        }

        const callParent = memberParent.parent;
        if (!callParent || callParent.type !== "CallExpression" || callParent.callee !== memberParent) {
          break;
        }

        methods.push({ name: memberParent.property.name, callNode: callParent });
        cursor = callParent;
      }

      return methods;
    }

    /**
     * Check whether a CallExpression is a `.gte("created_at", <anything>)` call.
     */
    function isGteCreatedAt(callNode) {
      const callee = callNode.callee;
      if (
        !callee ||
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.property.type !== "Identifier" ||
        callee.property.name !== "gte"
      ) {
        return false;
      }
      const firstArg = callNode.arguments[0];
      return (
        firstArg &&
        firstArg.type === "Literal" &&
        firstArg.value === "created_at"
      );
    }

    /**
     * Check whether a CallExpression is a `.select(<any>, { count: <any> })` or
     * `.select(<any>, { head: true })` call (Supabase count/head indicator).
     */
    function isCountSelect(callNode) {
      const callee = callNode.callee;
      if (
        !callee ||
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.property.type !== "Identifier" ||
        callee.property.name !== "select"
      ) {
        return false;
      }

      // Must have a second argument that is an ObjectExpression with a
      // "count" or "head" property.
      const secondArg = callNode.arguments[1];
      if (!secondArg || secondArg.type !== "ObjectExpression") return false;

      return secondArg.properties.some(
        (prop) =>
          prop.type === "Property" &&
          !prop.computed &&
          prop.key.type === "Identifier" &&
          (prop.key.name === "count" || prop.key.name === "head"),
      );
    }

    return {
      CallExpression(node) {
        // We're interested in `.from("placements")` or `.from("messages")`.
        const callee = node.callee;
        if (
          !callee ||
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "from"
        ) {
          return;
        }

        const firstArg = node.arguments[0];
        if (
          !firstArg ||
          firstArg.type !== "Literal" ||
          (firstArg.value !== "placements" && firstArg.value !== "messages")
        ) {
          return;
        }

        // Walk up the fluent chain to collect all method calls on it.
        let chainMethods;
        try {
          chainMethods = collectChainMethods(node);
        } catch {
          // AST walking failed for some reason — bail safely rather than crash.
          return;
        }

        // Inspect each call in the chain for the two cap indicators.
        let hasGteCreatedAt = false;
        let hasCountSelect = false;

        for (const { callNode } of chainMethods) {
          if (!hasGteCreatedAt && isGteCreatedAt(callNode)) hasGteCreatedAt = true;
          if (!hasCountSelect && isCountSelect(callNode)) hasCountSelect = true;
          if (hasGteCreatedAt && hasCountSelect) break;
        }

        if (hasGteCreatedAt && hasCountSelect) {
          context.report({ node, messageId: "adHocCap" });
        }
      },
    };
  },
};
