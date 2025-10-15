import path from "node:path";
import { fileURLToPath } from "node:url";

import { fixupPluginRules } from "@eslint/compat";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import _import from "eslint-plugin-import";
import json from "eslint-plugin-json";
import prettier from "eslint-plugin-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";
import globals from "globals";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "!.*",
      "data/",
      "contracts/",
      "dist/",
      "node_modules/",
      "debug/",
      "typechain-types/",
      "**/typechain-types/**",
      ".github/",
      ".yarn/",
      "legacy-tests/",
      "typechain/",
      "artifacts/",
      "**/artifacts/**",
    ],
  },
  {
    files: [
      "*.ts",
      "*.js",
      "*.json",
      "typescript/**/*.ts",
      "typescript/**/*.js",
      "test/**/*.ts",
      "deploy/**/*.ts",
      "deploy/**/*.js",
      "config/**/*.ts",
      "config/**/*.js",
    ],
  },
  ...compat.extends("plugin:jsdoc/recommended", "plugin:eslint-comments/recommended", "prettier"),
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
      import: fixupPluginRules(_import),
      json,
      prettier,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 11,
        sourceType: "module",
      },
    },
    rules: {
      "max-len": [
        "error",
        {
          code: 140,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
          ignoreComments: true,
        },
      ],
      "prettier/prettier": [
        "error",
        {
          printWidth: 140,
          tabWidth: 2,
          useTabs: false,
          singleQuote: false,
          semi: true,
          trailingComma: "all",
          bracketSpacing: true,
          arrowParens: "always",
          endOfLine: "auto",
        },
      ],
      camelcase: "off", // Disabled because constants should use UPPER_SNAKE_CASE
      "@typescript-eslint/explicit-function-return-type": "error",
      "eslint-comments/require-description": ["error"],
      "json/*": [
        "error",
        {
          allowComments: true,
        },
      ],
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: ["*"],
          next: ["block-like"],
        },
      ],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "import/first": "error",
      "import/newline-after-import": "error",
      "import/no-duplicates": "error",
      "jsdoc/require-jsdoc": "error",
      "jsdoc/require-description": "error",
      "jsdoc/tag-lines": [
        "error",
        "never",
        {
          startLines: 1,
        },
      ],
      "jsdoc/require-param-type": "off",
      "jsdoc/require-returns-type": "off",
      "jsdoc/require-property-type": "off",
    },
  },
];
