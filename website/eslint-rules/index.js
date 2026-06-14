// Custom ESLint rules for Wallplace — rules are added per remediation phase.

const noRawOrFilter = require("./no-raw-or-filter");
const noInlineAdminCheck = require("./no-inline-admin-check");

module.exports = {
  meta: {
    name: "eslint-plugin-wallplace",
    version: "0.0.0",
  },
  rules: {
    "no-raw-or-filter": noRawOrFilter,
    "no-inline-admin-check": noInlineAdminCheck,
  },
};
