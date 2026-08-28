"use strict";

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid inline admin checks (ADMIN_EMAILS env reads or admin_users table queries) " +
        "outside of src/lib/admin-auth.ts. Use isAdminRequest()/getAdminUser() instead.",
    },
    schema: [],
    messages: {
      inlineAdmin:
        "Use isAdminRequest()/getAdminUser() from @/lib/admin-auth instead of an inline admin check " +
        "(env allowlist or admin_users table).",
    },
  },

  create(context) {
    const fn = (context.filename || context.getFilename()).replace(/\\/g, "/");
    // admin-auth.ts is the canonical home for these checks — always exempt.
    if (fn.endsWith("src/lib/admin-auth.ts")) return {};
    // NO OTHER EXEMPTION. There used to be one for src/lib/email.ts, which read
    // ADMIN_EMAIL as a delivery address rather than an auth allowlist. K1
    // DELETED that file, and the exemption outlived it: a dead path that would
    // silently have covered whatever was created at that name next. 09 §2.9 says
    // to repoint it at the replacement; deleting it is better, because the
    // replacement does not need it. `src/lib/email/admin-alert.ts` imports
    // `adminEmails()` from admin-auth rather than reading the env itself, so the
    // ops inbox is the same list this rule protects, by construction.

    return {
      // Flag: process.env.ADMIN_EMAILS or process.env.ADMIN_EMAIL (reads only)
      MemberExpression(node) {
        if (
          node.object.type !== "MemberExpression" ||
          node.object.object.type !== "Identifier" ||
          node.object.object.name !== "process" ||
          node.object.property.type !== "Identifier" ||
          node.object.property.name !== "env" ||
          node.property.type !== "Identifier" ||
          (node.property.name !== "ADMIN_EMAILS" && node.property.name !== "ADMIN_EMAIL")
        ) {
          return;
        }

        // Skip writes: LHS of an AssignmentExpression
        const parent = node.parent;
        if (
          parent.type === "AssignmentExpression" &&
          parent.left === node
        ) {
          return;
        }

        // Skip deletes: argument of a UnaryExpression with operator "delete"
        if (
          parent.type === "UnaryExpression" &&
          parent.operator === "delete"
        ) {
          return;
        }

        context.report({ node, messageId: "inlineAdmin" });
      },

      // Flag: <expr>.from("admin_users")
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.property.type !== "Identifier" ||
          node.callee.property.name !== "from"
        ) {
          return;
        }

        const firstArg = node.arguments[0];
        if (
          !firstArg ||
          firstArg.type !== "Literal" ||
          firstArg.value !== "admin_users"
        ) {
          return;
        }

        context.report({ node, messageId: "inlineAdmin" });
      },
    };
  },
};
