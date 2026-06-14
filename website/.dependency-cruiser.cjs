/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-admin-client-in-client",
      comment:
        "Client components and page modules must not import the Supabase service-role admin client " +
        "(src/lib/supabase-admin). That client carries the service-role key and must only be used " +
        "in server-side code (API routes, Server Actions, middleware). " +
        "Severity is 'warn' in Phase 0; it will be raised to 'error' in Phase 1 once any real " +
        "violations have been remediated.",
      severity: "warn",
      from: {
        path: "^src/(components|app/.*(page|client))",
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
