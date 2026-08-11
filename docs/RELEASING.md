# Releasing

Versioning is automated. Nothing is hand-edited: the version, the tag, the
CHANGELOG entry and the GitHub release all come from commit messages.

## How a release happens

1. A commit lands on `main`.
2. `.github/workflows/release.yml` runs lint, typecheck, test and build.
3. If those pass, `semantic-release` reads the commits since the last tag,
   decides the next version, and publishes it.

There is no manual step and no version to bump by hand. A release only happens
if the verify job passed, so a broken `main` cannot be released.

## What triggers a version bump

Derived from the Conventional Commit types that `commitlint` already enforces:

| Commit                                         | Result         |
| ---------------------------------------------- | -------------- |
| `feat: ...`                                    | minor (0.1.0)  |
| `fix: ...`                                     | patch (0.0.1)  |
| `perf: ...` / `refactor: ...`                  | patch          |
| anything with `scope: deps`                    | patch          |
| `docs` `style` `test` `chore` `ci` `build`     | **no release** |
| any type with `BREAKING CHANGE:` in the footer | major          |

The last row is the one to remember: a long run of `chore:` and `docs:` commits
produces no release at all, and that is intended rather than a failure.

## Checking what would be released

```bash
pnpm release:dry
```

Runs the real analysis against the real commit history and prints the version it
would pick, without tagging or publishing anything.

## What a release changes

- `CHANGELOG.md` — generated, never edited by hand
- `package.json` version at the root — a single version line for the whole repo,
  since no package is published to npm
- a `v*` git tag and a matching GitHub release
- one commit: `chore(release): x.y.z [skip ci]`

## Requirements

**A GitHub remote.** `@semantic-release/github` creates the release through the
GitHub API. Until `git remote -v` shows a GitHub repository, the release job
fails with `ENOGHTOKEN` / "The git repository URL is not a valid GitHub URL".
Nothing else needs configuring — `GITHUB_TOKEN` is provided automatically to the
workflow, so no secret needs creating.

**Node 22+.** The release toolchain requires it, and Node 20 is end-of-life.
`.nvmrc` pins the version the workflow uses.

## Things that are deliberate

**No `preset` is configured — the default is used on purpose.** Setting
`preset: "conventionalcommits"` looks like the obvious choice given commitlint,
and it produced release notes with no sections at all: a bare `## 1.0.0` header
and nothing under it. The cause is that `@semantic-release/release-notes-generator`
resolves `conventional-changelog-conventionalcommits` from its **own** dependency
tree, where pnpm has nested version 7, while a root-level install lands version 10
that the plugin never loads. The two versions take different `presetConfig`
shapes, so the config silently fails to match and the writer falls back to an
ungrouped list. The default preset needs no extra package and groups correctly
into Features and Bug Fixes. If you ever add a preset back, verify the notes with
`pnpm release:dry` rather than trusting that the config was applied.

**`HUSKY: "0"` in the workflow.** `pnpm install` runs the root `prepare` script,
which installs husky's git hooks. In CI they only get in the way — and
commitlint would run against semantic-release's own release commit.

**The release commit message has no body.** Release notes routinely exceed
commitlint's 100-character body line limit, so the notes live in the CHANGELOG
and the GitHub release rather than in the commit body.

**`concurrency` never cancels a run in progress.** Two concurrent releases would
race to compute the next version from the same tags. Cancelling halfway is
worse: it can leave a tag with no GitHub release attached.

**`fetch-depth: 0` and `persist-credentials: false`.** semantic-release derives
the last release from tags and needs full history — a shallow clone makes every
run look like the first release. Disabling persisted credentials makes it
authenticate with `GITHUB_TOKEN` rather than whatever checkout left in
`.git/config`.

**A placeholder Clerk key in CI.** The web build validates its environment and
refuses to build without `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. CI has no
`.env.local`, so the workflow supplies the real key when configured as a secret
and a well-formed placeholder otherwise: enough to compile, never enough to
authenticate.

## Not yet covered

The verify job runs on pushes to `main` only. Pull requests are not gated —
that belongs with the wider CI work in Phase 8, along with e2e tests (which need
a Postgres service container; the current unit tests mock the pool and run
without a database).
