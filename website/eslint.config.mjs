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
