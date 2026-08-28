// Custom ESLint rules for Wallplace — rules are added per remediation phase.

const noRawOrFilter = require("./no-raw-or-filter");
const noInlineAdminCheck = require("./no-inline-admin-check");
const noUnawaitedCriticalSideeffect = require("./no-unawaited-critical-sideeffect");
const noAdHocCap = require("./no-ad-hoc-cap");
const noRedirectParam = require("./no-redirect-param");
const noRawArrangementType = require("./no-raw-arrangement-type");
const requireAuthzOnMutation = require("./require-authz-on-mutation");
const noSpreadIntoDbWrite = require("./no-spread-into-db-write");
const noAuthfetchMutation = require("./no-authfetch-mutation");
const noParallelBilling = require("./no-parallel-billing");

module.exports = {
  meta: {
    name: "eslint-plugin-wallplace",
    version: "0.0.0",
  },
  rules: {
    "no-raw-or-filter": noRawOrFilter,
    "no-inline-admin-check": noInlineAdminCheck,
    "no-unawaited-critical-sideeffect": noUnawaitedCriticalSideeffect,
    "no-ad-hoc-cap": noAdHocCap,
    "no-redirect-param": noRedirectParam,
    "no-raw-arrangement-type": noRawArrangementType,
    "require-authz-on-mutation": requireAuthzOnMutation,
    "no-spread-into-db-write": noSpreadIntoDbWrite,
    "no-authfetch-mutation": noAuthfetchMutation,
    "no-parallel-billing": noParallelBilling,
  },
};
