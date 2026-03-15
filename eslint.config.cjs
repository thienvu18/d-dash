const {
    defineConfig,
    globalIgnores,
} = require("eslint/config");

const globals = require("globals");
const tsParser = require("@typescript-eslint/parser");
const typescriptEslint = require("@typescript-eslint/eslint-plugin");
const js = require("@eslint/js");

const {
    FlatCompat,
} = require("@eslint/eslintrc");

const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

module.exports = defineConfig([{
    languageOptions: {
        globals: {
            ...globals.node,
        },
    },
}, globalIgnores(["**/dist/**/*", "docs/api/**/*", "node_modules/**/*", "coverage/**/*"]), {
    files: ["**/*.ts"],

    languageOptions: {
        parser: tsParser,
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: {},
    },

    plugins: {
        "@typescript-eslint": typescriptEslint,
    },

    extends: compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended"),

    rules: {
        "@typescript-eslint/no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],
    },
}, {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],

    languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: {},
    },

    extends: compat.extends("eslint:recommended"),

    rules: {
        "no-unused-vars": ["error", {
            argsIgnorePattern: "^_",
        }],
    },
}, {
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
}, {
    files: ["examples/basic/src/browser/**/*.js"],

    languageOptions: {
        globals: {
            ...globals.browser,
        },
    },
}]);
