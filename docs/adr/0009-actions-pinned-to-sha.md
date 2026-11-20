# 0009. GitHub Actions pinned to full commit SHAs

- **Status:** Accepted
- **Date:** 2026-11-19 (the first workflow, commit `837d2bd`; recorded
  retroactively the same day)

## Context

A workflow step written as `uses: owner/action@v4` runs whatever commit the
tag `v4` points at when the job starts. Tags can be moved. In March 2025
the `tj-actions/changed-files` compromise (CVE-2025-30066) re-pointed that
action's version tags at a commit that dumped CI secrets into the logs of
every repository using it. This repository runs third-party actions on
every pull request, and it is public.

## Decision

Every `uses:` in [`.github/workflows/`](../../.github/workflows/) names a
full 40-character commit SHA, with the release tag in a comment:
`uses: actions/checkout@<sha> # v7.0.1`. Dependabot's `github-actions`
ecosystem keeps the pins current
([`.github/dependabot.yml`](../../.github/dependabot.yml)). The first
workflow also set the rest of the hardening that every workflow since has
followed: `permissions: contents: read` at the top, widened per job only
where needed, and `persist-credentials: false` on every checkout
([SECURITY.md](../../SECURITY.md#supply-chain)).

## Alternatives considered

- **Version tags (`@v7`).** The default in most documentation, and the
  exact mechanism the 2025 attack used.
- **Exact release tags (`@v7.0.1`).** Easier to read, but still a tag, and
  a tag can be moved just like a major-version tag.

## Consequences

- What runs in CI is exactly what was reviewed when the pin was set.
- A SHA says nothing to a reader. The tag comment is what makes a pin
  reviewable, and a Dependabot pull request updates both.
- A pin does not make the pinned code safe. It only stops the code from
  changing without a pull request, which a person (or an agent) still has
  to read.
- New workflows must follow the same rule. Nothing in CI enforces it; it
  is checked in review.
