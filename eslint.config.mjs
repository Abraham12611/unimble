import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/build/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-unused-vars": "warn",
    },
  },
];
