module.exports = {
  root: true,
  ignorePatterns: [
    "**/dist/**",
    "docs/api/**",
    "node_modules/**",
    "coverage/**",
  ],
  env: {
    es2022: true,
    node: true,
  },
  overrides: [
    {
      files: ["**/*.ts"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      plugins: ["@typescript-eslint"],
      extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_" },
        ],
      },
    },
    {
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      extends: ["eslint:recommended"],
      rules: {
        "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      },
    },
    {
      files: ["**/*.spec.js"],
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
    {
      files: ["examples/basic/src/browser/**/*.js"],
      env: {
        browser: true,
      },
    },
  ],
};
