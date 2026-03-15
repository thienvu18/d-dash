import { defineConfig, globalIgnores } from "eslint/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import globals from "globals";
import tsParser from "@typescript-eslint/parser";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  globalIgnores(["**/dist/**/*", "docs/api/**/*", "node_modules/**/*", "coverage/**/*"]),
  ...compat.extends("eslint:recommended"),
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["**/*.ts"],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // adapter packages reference DOM types; tsconfig provides the types,
        // ESLint needs the globals so no-undef doesn't flag HTMLElement etc.
        ...globals.browser,
      },
    },

    plugins: {
      "@typescript-eslint": typescriptEslint,
    },

    rules: {
      ...typescriptEslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },

    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.spec.js"],

    languageOptions: {
      globals: {
        describe: "readonly",
        test: "readonly",
        it: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
  {
    files: ["examples/basic/src/browser/**/*.js"],

    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
]);
