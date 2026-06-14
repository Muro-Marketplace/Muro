/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-admin-client-in-client",
      comment:
        "The PRIMARY guard is the `import 'server-only'` directive at the top of " +
        "src/lib/supabase-admin.ts: if any client component (anywhere in src/app or src/components) " +
        "imports it, Next.js will fail the build with a hard error at bundle time. " +
        "This dependency-cruiser rule is defence-in-depth on the src/components/** tree only, " +
        "giving a fast, import-graph-level signal before a build. " +
        "The old `app/.*(page|client)` matcher was dropped because the (pages) route-group name " +
        "caused it to flag legitimate Server Component pages as violations (4 false positives). " +
        "All app-directory client components are already covered by the server-only build guard.",
      severity: "error",
      from: {
        path: "^src/components/",
      },
      to: {
        path: "^src/lib/supabase-admin",
      },
    },
    /*
     * no-inline-admin-bypass
     *
     * This rule is intentionally NOT implemented here. Dependency-cruiser operates on the
     * import graph and cannot detect inline calls such as
     *   createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
     * that bypass the shared admin client without importing it at all.
     *
     * That pattern is enforced by the ESLint rule `wallplace/no-inline-admin-check`,
     * which is added to the eslint-plugin-wallplace scaffold in Phase 1.
     */
  ],

  options: {
    /* Resolve the @/ TypeScript path alias (maps to src/) so that rules using
     * "^src/..." path regexes match imports written as "@/lib/supabase-admin". */
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },

    /* Do not traverse into node_modules. */
    doNotFollow: {
      path: "node_modules",
    },

    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
