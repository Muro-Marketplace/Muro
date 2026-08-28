import { createRequire } from "node:module";
import { Linter } from "eslint";
import { describe, it, expect } from "vitest";

const require = createRequire(import.meta.url);
const rule = require("../../eslint-rules/no-unawaited-critical-sideeffect.js") as import("eslint").Rule.RuleModule;

const RULE_NAME = "wallplace/no-unawaited-critical-sideeffect";
const API_FILE = "/project/src/app/api/webhooks/route.js";
const NON_API_FILE = "/project/src/lib/helpers.js";
const API_TEST_FILE = "/project/src/app/api/webhooks/route.test.js";

/**
 * Use the legacy eslintrc configType so we can pass a `filename` option
 * through the third argument of `linter.verify()`. ESLint 9 flat-config
 * mode requires every filename to be matched by a `files` glob in the
 * config array — cumbersome for unit tests. The eslintrc mode still works
 * in ESLint 9 and accepts arbitrary filenames cleanly.
 *
 * Snippets are wrapped in `async function f() { ... }` so `await` is legal;
 * the rule only examines ExpressionStatements so the wrapper is transparent.
 */
function lint(snippet: string, filename: string = API_FILE) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linter = new Linter({ configType: "eslintrc" } as any);
  linter.defineRule(RULE_NAME, rule);
  const code = `async function f() { ${snippet}; }`;
  return linter.verify(
    code,
    {
      env: { es2020: true },
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
      rules: { [RULE_NAME]: "error" },
    },
    { filename },
  );
}

describe("wallplace/no-unawaited-critical-sideeffect", () => {
  // ──── valid cases ─────────────────────────────────────────────────────────

  it("allows awaited notify with a catch handler", () => {
    const messages = lint("await notifyX({}).catch(() => {})");
    expect(messages).toHaveLength(0);
  });

  it("allows plain await of a notify call", () => {
    const messages = lint("await notifyX({})");
    expect(messages).toHaveLength(0);
  });

  it("allows a .catch() on a non-denylisted function", () => {
    const messages = lint("createNotification({}).catch(() => {})");
    expect(messages).toHaveLength(0);
  });

  it("allows a bare notify call in a non-api file path", () => {
    const messages = lint("notifyX({})", NON_API_FILE);
    expect(messages).toHaveLength(0);
  });

  it("allows assigning a notify call to a variable (not statement-discarded)", () => {
    const messages = lint("const p = notifyX({})");
    expect(messages).toHaveLength(0);
  });

  it("allows awaited executeTransfer", () => {
    const messages = lint("await executeTransfer({})");
    expect(messages).toHaveLength(0);
  });

  // ──── invalid cases ───────────────────────────────────────────────────────

  it("flags a bare notify call at statement level in an api file", () => {
    const messages = lint("notifyX({})");
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_NAME);
  });

  it("flags a notify(...).catch(() => {}) statement in an api file", () => {
    const messages = lint("notifyX({}).catch(() => {})");
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_NAME);
  });

  it("flags an executeTransfer(...).catch(() => {}) statement in an api file", () => {
    const messages = lint("executeTransfer({}).catch(() => {})");
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe(RULE_NAME);
  });

  it("does NOT flag a bare notify call in a .test.js file inside api/", () => {
    const messages = lint("notifyX({})", API_TEST_FILE);
    expect(messages).toHaveLength(0);
  });

  // ──── 09 item 2.8: the four names that replaced the notify* functions ─────
  //
  // The denylist was `executeTransfer` plus /^notify/, and K1 DELETED every
  // notify* function when it removed src/lib/email.ts. So the rule guarded one
  // real name and a pattern that matched nothing, while the four functions that
  // took over the job were uncovered. On Vercel an un-awaited promise left
  // running after the response can be killed mid-flight: the send is dropped and
  // `email_events` records nothing, which is the exact failure that table exists
  // to make visible.

  const CRITICAL = [
    "sendEmail",
    "sendTransactional",
    "sendAdminAlert",
    "sendMessageUnreadEmail",
    "recordOrderEvent",
  ];

  for (const name of CRITICAL) {
    it(`flags a bare ${name}(...) at statement level`, () => {
      const messages = lint(`${name}({})`);
      expect(messages).toHaveLength(1);
      expect(messages[0].ruleId).toBe(RULE_NAME);
    });

    it(`flags ${name}(...).catch(...), which looks handled and is not`, () => {
      // A `.catch()` stops an unhandled rejection. It does not keep the runtime
      // alive long enough for the send to finish.
      const messages = lint(`${name}({}).catch(() => {})`);
      expect(messages).toHaveLength(1);
    });

    it(`allows an awaited ${name}`, () => {
      expect(lint(`await ${name}({})`)).toHaveLength(0);
    });

    it(`allows ${name} inside afterResponse, which keeps the function alive`, () => {
      expect(lint(`afterResponse(async () => { await ${name}({}) })`)).toHaveLength(0);
    });
  }

  it("still flags a hand-rolled notify* function, so a new one is caught on the way in", () => {
    // The pattern is kept even though it currently matches nothing.
    expect(lint("notifySomethingNew({})")).toHaveLength(1);
  });

  it("does not flag a call that merely contains a critical name", () => {
    // `sendEmailPreferencesLink` is not `sendEmail`.
    expect(lint("sendEmailPreferencesLink({})")).toHaveLength(0);
  });
});
