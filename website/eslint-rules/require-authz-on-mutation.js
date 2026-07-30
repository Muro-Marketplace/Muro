"use strict";

// Makes "a service-role route that mutates without an authorisation import" a
// lint failure, so the next E19 cannot be added silently.
//
// KNOWN LIMITS, stated here so nobody over-trusts the rule:
//
//   - It is an IMPORT-PRESENCE check, not a call-graph check. A route can import
//     @/lib/authz and never call it. The per-route negative tests are what prove
//     the call happens; this rule only stops the "no authorisation concept at
//     all" class.
//   - It does not follow indirection. src/app/api/artist-works/route.ts does not
//     import getSupabaseAdmin at all, src/lib/db/artist-works.ts does, so E32's
//     file would NOT have been caught here. Extending detection to treat a
//     @/lib/db/* import from a mutating route as service-role-equivalent is a
//     later task in 01 Part 4.
//   - src/app/api/walls/[id]/route.ts is a legitimate implementation using a
//     local resolveAndAuthorize() helper. It is allowlisted with a migration
//     TODO rather than contorted to satisfy the rule.

const { PUBLIC_ROUTES, DEMO_EXEMPT_ROUTES } = require("./public-routes");

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Normalise an absolute filename to a repo-relative posix path. */
function relPath(filename) {
  const fn = (filename || "").replace(/\\/g, "/");
  const i = fn.indexOf("src/app/api/");
  return i === -1 ? fn : fn.slice(i);
}

/** @type {import("eslint").Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "API routes that mutate through the service-role client (which bypasses RLS) " +
        "must import an assert*() helper from @/lib/authz, or be on the PUBLIC_ROUTES " +
        "allowlist with a stated reason.",
    },
    schema: [],
    messages: {
      missingAuthz:
        "{{route}} exports {{method}} and uses the service-role client, which BYPASSES RLS, " +
        "but imports nothing from @/lib/authz. Add the relevant assert*() call, or add the " +
        "route to PUBLIC_ROUTES in eslint-rules/public-routes.js with a reason.",
      missingDemoGuard:
        "{{route}} exports {{method}} and mutates, but does not import @/lib/demo-guard. " +
        "Add assertNotDemo()/assertNotDemoStrict() after the auth check, or add the route " +
        "to DEMO_EXEMPT_ROUTES in eslint-rules/public-routes.js with a reason.",
    },
  },

  create(context) {
    const file = relPath(context.filename || context.getFilename());
    if (!/^src\/app\/api\/.+\/route\.ts$/.test(file)) return {};

    let usesServiceRole = false;
    let hasAuthzImport = false;
    let hasAdminAuthImport = false;
    let hasDemoGuardImport = false;
    /** @type {{node: import("estree").Node, method: string}[]} */
    const mutators = [];

    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (src === "@/lib/supabase-admin") usesServiceRole = true;
        // E32's blind spot (01 Phase E item 15). A route that never names
        // supabase-admin but imports a @/lib/db/* helper is still writing with
        // the service-role client, because that is what those helpers use
        // internally. E32 itself was exactly this shape: api/artist-works never
        // touched supabase-admin, it called lib/db/artist-works.ts, so the rule
        // could not see it and the unscoped update went unflagged.
        if (/^@\/lib\/db\//.test(src)) usesServiceRole = true;
        if (src === "@/lib/authz") hasAuthzImport = true;
        if (src === "@/lib/admin-auth") hasAdminAuthImport = true;
        if (src === "@/lib/demo-guard") hasDemoGuardImport = true;
      },

      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        // export async function POST() {}
        if (decl.type === "FunctionDeclaration" && decl.id) {
          if (MUTATING.has(decl.id.name)) mutators.push({ node: decl.id, method: decl.id.name });
          return;
        }

        // export const POST = async () => {}
        // Not in the spec's version, but src/app/api/stripe-connect/process-pending/route.ts
        // uses this form, so matching only FunctionDeclaration leaves a real hole.
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id && d.id.type === "Identifier" && MUTATING.has(d.id.name)) {
              mutators.push({ node: d.id, method: d.id.name });
            }
          }
        }
      },

      "Program:exit"() {
        if (!usesServiceRole || mutators.length === 0) return;

        const publiclyAllowed = Object.prototype.hasOwnProperty.call(PUBLIC_ROUTES, file);
        const demoAllowed = Object.prototype.hasOwnProperty.call(DEMO_EXEMPT_ROUTES, file);

        for (const { node, method } of mutators) {
          if (!hasAuthzImport && !hasAdminAuthImport && !publiclyAllowed) {
            context.report({ node, messageId: "missingAuthz", data: { route: file, method } });
          }
          if (!hasDemoGuardImport && !demoAllowed) {
            context.report({ node, messageId: "missingDemoGuard", data: { route: file, method } });
          }
        }
      },
    };
  },
};
