import eslint from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-undef": "off",
      "obsidianmd/ui/sentence-case": ["warn", {
        "brands": ["BibTeX"],
        "acronyms": ["CSL"],
        "enforceCamelCaseLower": true
      }]
    }
  },
  {
    files: ["src/settings-tab.ts", "tests/settings-tab.test.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off"
    }
  },
  {
    ignores: ["main.js", "node_modules/**", "coverage/**"]
  }
);
