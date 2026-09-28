import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "playwright-report", "test-results", "node_modules"] },

  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: {
        // `no-floating-promises` needs type information to know a call returns a
        // promise. `projectService` resolves the tsconfig without naming files here.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // eslint-plugin-react-hooks v7 introduced stricter rules that flag pre-existing patterns.
      // Downgrade to warnings until we refactor the affected components.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",

      // A file may only export components. Anything else belongs in a sibling module,
      // which keeps fast-refresh working during development.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // Unused code is dead code. TypeScript's noUnusedLocals covers variables;
      // these cover the rest.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // `any` silently disables type checking, so it needs a deliberate opt-out.
      "@typescript-eslint/no-explicit-any": "error",

      "eqeqeq": ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  {
    // A provider and its matching hook belong in one file. Splitting them would force
    // readers to open two files to learn how to read the session, so this is allowed
    // deliberately rather than worked around.
    files: ["**/*Provider.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },

  {
    // Tests may use any freely; assertions do not need the same discipline.
    files: ["**/*.test.{ts,tsx}", "src/test/**", "tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  {
    // Config files run in Node, not the browser.
    files: ["*.config.{ts,js}", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
);
