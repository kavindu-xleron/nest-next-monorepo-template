import { nodeNestConfig } from "@workspace/eslint-config/node-nest"

/**
 * Reaching into another module's layers instead of through its index.ts.
 *
 * Extracted to a constant because it has to be repeated in every block that
 * sets `no-restricted-imports` for a path under src/modules — see the ordering
 * note on the domain block below.
 */
const CROSS_MODULE_INTERNALS = {
  group: [
    "@modules/*/domain/**",
    "@modules/*/application/**",
    "@modules/*/infrastructure/**",
    "@modules/*/presentation/**",
  ],
  message:
    "Import another module through its index.ts barrel. Inside your own module, use relative paths.",
}

/**
 * Architectural boundaries for the layered module structure.
 * See docs/implementation plans/modular-architecture/README.md.
 *
 * Direction of dependency: modules -> core -> shared. Never upward.
 */
export default [
  ...nodeNestConfig,

  // core/ is infrastructure. It may not know a business domain exists.
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@modules/*", "@modules/**", "**/modules/**"],
              message:
                "core must not depend on a business module. Define a port in core (see core/auth/ports) and let the module implement it.",
            },
          ],
        },
      ],
    },
  },

  // Modules talk to each other through index.ts, never through internals.
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [CROSS_MODULE_INTERNALS] }],
    },
  },

  // domain/ is plain types and ports. No framework, no driver, no vendor SDK.
  //
  // Ordering here is load-bearing, and wrong ordering fails silently. Flat
  // config REPLACES a rule's options rather than merging them, so for any file
  // matched by two blocks the last one wins outright. This block must therefore
  // come after the src/modules/** block above, and must restate
  // CROSS_MODULE_INTERNALS — otherwise domain/ files would lose that rule.
  //
  // Verified by probe: with the blocks in the opposite order, a domain/ file
  // importing drizzle-orm produced no diagnostic at all.
  {
    files: ["src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            CROSS_MODULE_INTERNALS,
            {
              group: [
                "drizzle-orm",
                "drizzle-orm/**",
                "pg",
                "@nestjs/swagger",
                "nestjs-zod",
                "@clerk/**",
                "svix",
              ],
              message:
                "domain/ holds business types and ports. Persistence, HTTP and vendor SDKs belong in infrastructure/ or presentation/.",
            },
          ],
        },
      ],
    },
  },
]
