import { nodeNestConfig } from "@workspace/eslint-config/node-nest"

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

  // domain/ is plain types and ports. No framework, no driver, no vendor SDK.
  {
    files: ["src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
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

  // Modules talk to each other through index.ts, never through internals.
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@modules/*/domain/**",
                "@modules/*/application/**",
                "@modules/*/infrastructure/**",
                "@modules/*/presentation/**",
              ],
              message:
                "Import another module through its index.ts barrel. Inside your own module, use relative paths.",
            },
          ],
        },
      ],
    },
  },
]
