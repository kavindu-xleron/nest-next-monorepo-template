module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      ["api", "web", "ui", "contracts", "config", "deps", "release"],
    ],
  },
}
