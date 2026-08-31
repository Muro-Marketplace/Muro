"use strict";

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid re-implementing an inline windowed outreach counter on the placements or messages table. " +
        "The canonical aggregation is checkArtistOutreachCap() in src/lib/outreach-cap.ts. " +
        "Siloed inline counters let artists exceed the real cap by spreading outreach across surfaces.",
    },
    schema: [],
    messages: {
      adHocCap:
        "Rolling-window outreach counting belongs in checkArtistOutreachCap() (src/lib/outreach-cap.ts). " +
        "Do not re-implement an inline placements/messages counter.",
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

    /**
     * Columns that identify WHOSE rows are being counted. A chain that filters
     * on one of these plus a created_at window is a per-user windowed counter,
     * whether or not it asks Supabase for a count: since the cap helper stopped
     * using { count: "exact" } (it needs the timestamps to work out when an
     * approach frees up), a copied counter would otherwise slip past this rule.
     */
    const ACTOR_COLUMNS = new Set([
      "created_by_user_id",
      "proposed_by_user_id",
      "requester_user_id",
      "sender_id",
      "artist_user_id",
    ]);

    function isActorEq(callNode) {
      const callee = callNode.callee;
      if (
        !callee ||
        callee.type !== "MemberExpression" ||
        callee.computed ||
        callee.property.type !== "Identifier" ||
        callee.property.name !== "eq"
      ) {
        return false;
      }
      const firstArg = callNode.arguments[0];
      return (
        firstArg &&
        firstArg.type === "Literal" &&
        typeof firstArg.value === "string" &&
        ACTOR_COLUMNS.has(firstArg.value)
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
        let hasActorEq = false;

        for (const { callNode } of chainMethods) {
          if (!hasGteCreatedAt && isGteCreatedAt(callNode)) hasGteCreatedAt = true;
          if (!hasCountSelect && isCountSelect(callNode)) hasCountSelect = true;
          if (!hasActorEq && isActorEq(callNode)) hasActorEq = true;
          if (hasGteCreatedAt && (hasCountSelect || hasActorEq)) break;
        }

        // A created_at window on its own is an ordinary date-ranged read. It
        // becomes a cap counter when it also asks for a count, or narrows to
        // one actor's rows.
        if (hasGteCreatedAt && (hasCountSelect || hasActorEq)) {
          context.report({ node, messageId: "adHocCap" });
        }
      },
    };
  },
};
