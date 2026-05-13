import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["node_modules/", "main.js", "tests/mocks/", "**/*.bak"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        navigator: "readonly",
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        NodeJS: "readonly",
      },
    },
    rules: {
      // Tools return structured JSON errors as text; intentional any in some wrapper points.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The MCP SDK types use `any` in a few places; don't flag every passthrough.
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  prettier,
];
