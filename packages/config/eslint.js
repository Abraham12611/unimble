// @unimble/config - Shared ESLint configuration
// This will be expanded with full ESLint config

module.exports = {
  extends: ["next/core-web-vitals", "prettier"],
  rules: {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
