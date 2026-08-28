"use strict";

/**
 * Forbid raw equality checks against the overloaded arrangement values
 * "free_loan" and "paid_loan". The legacy `free_loan` value means a paid
 * loan when a monthly fee is attached but a free display otherwise, and
 * `paid_loan` is the newer canonical value, so a hand-rolled
 * `=== "free_loan"` check silently mishandles `paid_loan` rows (the cause
 * of the "paid loan renders as Direct Purchase" and "Set up payment chip
 * missing" bugs). Route the decision through @/lib/arrangement-type.
 *
 * @type {import("eslint").Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Forbid raw equality checks against the \"free_loan\" / \"paid_loan\" arrangement values. " +
        "Use the predicates in @/lib/arrangement-type instead.",
    },
    schema: [],
    messages: {
      rawArrangementType:
        "Don't compare arrangement type to \"{{value}}\" directly. `free_loan` is overloaded " +
        "(paid loan with a fee, free display without) and `paid_loan` is the canonical value, so " +
        "raw checks mishandle one of them. Use isPaidLoan / isLoan / isFreeDisplay / isRevenueShare / " +
        "isPurchase from @/lib/arrangement-type.",
    },
  },

  create(context) {
    const filename = (context.filename || context.getFilename() || "").replace(/\\/g, "/");

    // Files that legitimately name these values: the canonical predicate module
    // and label map define them, and the placement request form types its
    // arrangement as a strict "revenue_share" | "free_loan" | "purchase" union
    // where free_loan IS the paid-loan option (paid_loan is not a possible
    // value there), so its comparisons are type-checked and correct.
    const EXEMPT = [
      "src/lib/arrangement-type.ts",
      "src/lib/arrangement-labels.ts",
      "src/components/SpacesPlacementRequestForm.tsx",
    ];

    // 09 item 4.6: these used to be matched as `endsWith("/src/lib/...")`, with
    // a leading slash, so an exemption only fired when ESLint supplied an
    // ABSOLUTE path. It does here, which is why lint stayed green and the gap
    // went unseen until this rule finally got a test. no-ad-hoc-cap already
    // handles both forms deliberately; this one now does too, so a relative
    // filename cannot start flagging the module that defines the values.
    const isExempt = EXEMPT.some(
      (suffix) => filename === suffix || filename.endsWith("/" + suffix),
    );
    if (isExempt) return {};

    const FLAGGED = new Set(["free_loan", "paid_loan"]);

    function check(node, other) {
      if (
        other &&
        other.type === "Literal" &&
        typeof other.value === "string" &&
        FLAGGED.has(other.value)
      ) {
        context.report({ node, messageId: "rawArrangementType", data: { value: other.value } });
      }
    }

    return {
      BinaryExpression(node) {
        if (node.operator !== "===" && node.operator !== "!==") return;
        check(node, node.right);
        check(node, node.left);
      },
    };
  },
};
