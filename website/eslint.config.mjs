import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import wallplace from "./eslint-rules/index.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Wallplace custom rules — populated per remediation phase.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: { wallplace },
    rules: {
      "wallplace/no-raw-or-filter": "error",
      "wallplace/no-inline-admin-check": "error",
      "wallplace/no-unawaited-critical-sideeffect": "error",
      "wallplace/no-ad-hoc-cap": "error",
      "wallplace/no-redirect-param": "error",
      "wallplace/no-raw-arrangement-type": "error",
      // C3: blocks the E44 / E45 shape, `.update({ ...body })`. Error from the
      // start, unlike require-authz-on-mutation: nothing in src/ violates it,
      // because the two legitimate spreads sit behind assertNoServerOwned().
      "wallplace/no-spread-into-db-write": "error",
      // Staged rollout per 01 Part 4 task 3: "warn" until Phase B to D convert
      // the routes, then "error". The doc contradicts itself here, section 3.3
      // shows "error" while the task checklist says "warn"; "error" today would
      // fail lint on every route not yet converted.
      "wallplace/require-authz-on-mutation": "warn",
      // 05 E43 / supervisor D67: mutations must go through mutate() (which throws
      // on non-2xx), not authFetch (which resolves on non-2xx = the false-success
      // class). "warn" with a grandfathered ratchet
      // (tests/integration/authfetch-mutation-ratchet.test.ts); flip to "error"
      // when the ratchet reaches zero.
      "wallplace/no-authfetch-mutation": "warn",
      // K2 (07 §2.7): subscription creation lives in one place per product.
      // "error" from the start, because nothing in src/ violates it once
      // startPaidLoanBilling is deleted — the allowlist in the rule is the
      // complete set of billing entry points, and adding to it is deliberate.
      "wallplace/no-parallel-billing": "error",
    },
  },
  // The eslint-rules/ plugin files are CommonJS by design — they cannot use
  // ESM import syntax. Suppress the TypeScript no-require-imports rule there.
  {
    files: ["eslint-rules/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
]);

export default eslintConfig;
