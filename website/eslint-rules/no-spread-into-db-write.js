"use strict";

/**
 * Forbid spreading a request-derived object into a Supabase write.
 *
 * E44 and E45 were both this one line: `.update({ ...body })` with the
 * service-role client. Whatever the client put in the JSON body reached the
 * column list, so an artist could self-approve (`review_status`), self-grant Pro
 * (`subscription_plan`), redirect their payouts (`stripe_connect_account_id`), or
 * hand their venue row to another account (`user_id`). The fix was pickWritable()
 * at the route plus assertNoServerOwned() at the db boundary; this rule is what
 * stops the next route from reintroducing the shape.
 *
 * Two shapes are flagged, because the second is the one that actually shipped:
 *
 *   db.from(t).update({ ...body })            // spread inside the write call
 *   const p = { ...body, x: 1 };              // assembled first,
 *   db.from(t).insert(p);                     // then written
 *
 * Deliberate limits, so nobody mistakes this for a proof:
 *   - It is a NAME heuristic. `body`, `payload` and `data` are the conventional
 *     names for an un-vetted request object; a spread of `req.json()` stored as
 *     `fields` sails past. The real controls are pickWritable() and
 *     assertNoServerOwned(). This rule only makes the careless shape loud.
 *   - The exemption is earned, not granted by filename: a spread is allowed when
 *     the enclosing function calls assertNoServerOwned(), which is the boundary
 *     guard that makes the spread safe. Delete the guard and the spread becomes
 *     an error, so the two cannot drift apart. That matters because E23a was a
 *     control that existed and did nothing.
 *   - pickWritable(...) is recognised as a safe wrapper, since filtering by
 *     allowlist is exactly what makes a spread acceptable.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid spreading a request-derived object (body / payload / data) into a " +
        "Supabase .insert() / .update() / .upsert() call. Build the payload with " +
        "pickWritable(), or guard the write with assertNoServerOwned().",
    },
    schema: [],
    messages: {
      spreadIntoWrite:
        "Don't spread `{{name}}` into a .{{method}}() call: every key the client sent " +
        "reaches the column list, which is exactly E44 / E45 (self-approve, self-grant " +
        "Pro, redirect payouts, reassign the row). Build the payload with pickWritable() " +
        "from @/lib/db/writable-fields, or call assertNoServerOwned() in this function " +
        "if the values are server-computed.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const filename = (context.filename || context.getFilename() || "").replace(/\\/g, "/");

    // Test files build deliberately-bad payloads to assert they are refused.
    if (/\.test\.[cm]?[jt]sx?$/.test(filename)) return {};

    const FLAGGED_NAMES = new Set(["body", "payload", "data"]);
    const WRITE_METHODS = new Set(["insert", "update", "upsert"]);
    const FUNCTION_TYPES = new Set([
      "FunctionDeclaration",
      "FunctionExpression",
      "ArrowFunctionExpression",
    ]);

    /** Identifier names handed to a write call: `insert(insertPayload)`. */
    const writtenNames = new Set();
    /** Functions containing an assertNoServerOwned() call. */
    const guardedFunctions = new Set();
    /** Deferred so a guard or a write that appears later in the file still counts. */
    const candidates = [];

    function enclosingFunctions(node) {
      return sourceCode.getAncestors(node).filter((a) => FUNCTION_TYPES.has(a.type));
    }

    return {
      CallExpression(node) {
        const callee = node.callee;

        // `db.from(t).insert(payloadVar)` — remember the variable name.
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          WRITE_METHODS.has(callee.property.name)
        ) {
          for (const arg of node.arguments) {
            if (arg.type === "Identifier") writtenNames.add(arg.name);
          }
        }

        // The compensating control, matched on the AST rather than on file text
        // so a comment mentioning the guard cannot stand in for calling it.
        if (callee.type === "Identifier" && callee.name === "assertNoServerOwned") {
          for (const fn of enclosingFunctions(node)) guardedFunctions.add(fn);
        }
      },

      SpreadElement(node) {
        if (node.argument.type !== "Identifier") return;
        if (!FLAGGED_NAMES.has(node.argument.name)) return;

        const ancestors = sourceCode.getAncestors(node);

        // pickWritable({ ...body }, ALLOW) filters by allowlist, so it is fine.
        const insidePickWritable = ancestors.some(
          (a) =>
            a.type === "CallExpression" &&
            a.callee.type === "Identifier" &&
            a.callee.name === "pickWritable",
        );
        if (insidePickWritable) return;

        // Shape 1: lexically inside the write call's arguments.
        let method = null;
        for (const a of ancestors) {
          if (
            a.type === "CallExpression" &&
            a.callee.type === "MemberExpression" &&
            a.callee.property.type === "Identifier" &&
            WRITE_METHODS.has(a.callee.property.name)
          ) {
            method = a.callee.property.name;
          }
        }

        // Shape 2: assembled into a variable that is written later.
        let varName = null;
        for (let i = ancestors.length - 1; i >= 0; i--) {
          if (ancestors[i].type === "VariableDeclarator" && ancestors[i].id.type === "Identifier") {
            varName = ancestors[i].id.name;
            break;
          }
          if (FUNCTION_TYPES.has(ancestors[i].type)) break;
        }

        if (!method && !varName) return;

        candidates.push({
          node,
          name: node.argument.name,
          method,
          varName,
          functions: enclosingFunctions(node),
        });
      },

      "Program:exit"() {
        for (const c of candidates) {
          const method = c.method || (c.varName && writtenNames.has(c.varName) ? "insert" : null);
          if (!method) continue;
          if (c.functions.some((fn) => guardedFunctions.has(fn))) continue;
          context.report({
            node: c.node,
            messageId: "spreadIntoWrite",
            data: { name: c.name, method },
          });
        }
      },
    };
  },
};
