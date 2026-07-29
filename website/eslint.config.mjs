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
      // Staged rollout per 01 Part 4 task 3: "warn" until Phase B to D convert
      // the routes, then "error". The doc contradicts itself here, section 3.3
      // shows "error" while the task checklist says "warn"; "error" today would
      // fail lint on every route not yet converted.
      "wallplace/require-authz-on-mutation": "warn",
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
