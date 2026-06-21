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
    // The canonical helper and the label map legitimately define these values.
    if (
      filename.endsWith("/src/lib/arrangement-type.ts") ||
      filename.endsWith("/src/lib/arrangement-labels.ts") ||
      // The placement request form types its arrangement as a strict
      // "revenue_share" | "free_loan" | "purchase" union, where free_loan IS
      // the paid-loan option (paid_loan is not a possible value there), so its
      // comparisons are type-checked and correct, not the bug pattern.
      filename.endsWith("/src/components/SpacesPlacementRequestForm.tsx")
    ) {
      return {};
    }

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
