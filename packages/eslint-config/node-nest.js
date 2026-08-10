import globals from "globals"
import tseslint from "typescript-eslint"
import { config as baseConfig } from "./base.js"

/**
 * A custom ESLint configuration for Node.js / NestJS applications.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const nodeNestConfig = tseslint.config(
  ...baseConfig,
  {
    ignores: ["eslint.config.mjs", "eslint.config.js"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: "commonjs",
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
)
