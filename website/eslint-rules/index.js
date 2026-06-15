// Custom ESLint rules for Wallplace — rules are added per remediation phase.

const noRawOrFilter = require("./no-raw-or-filter");
const noInlineAdminCheck = require("./no-inline-admin-check");
const noUnawaitedCriticalSideeffect = require("./no-unawaited-critical-sideeffect");
const noAdHocCap = require("./no-ad-hoc-cap");
const noRedirectParam = require("./no-redirect-param");
const noRawArrangementType = require("./no-raw-arrangement-type");

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
  },
};
