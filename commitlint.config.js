/**
 * Commit messages are load-bearing here: `.releaserc.json` derives the version
 * from the type, and the changelog is generated from the same commits. See
 * docs/COMMIT_CONVENTIONS.md for the full type -> release -> changelog mapping.
 *
 * Three sources of truth, kept deliberately separate:
 *   - this file          decides whether a message is *accepted*
 *   - .releaserc.json    decides whether a commit *releases*, and at what level
 *   - the changelog preset decides whether a commit is *published* in the notes
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Scopes map to workspaces, plus `repo` for root-level tooling. Severity 2:
    // an unlisted scope is a hard failure, so add new ones here first.
    "scope-enum": [
      2,
      "always",
      ["api", "web", "ui", "contracts", "config", "deps", "release", "repo"],
    ],
    // Scope is optional by design. It is strongly encouraged — it renders in
    // bold in the release notes and says which workspace changed — but a
    // genuinely repo-wide change should not have to invent one. When present it
    // must come from the enum above.
  },
}
