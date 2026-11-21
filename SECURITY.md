# Security

KeepTaste is a finished personal project and is not actively developed, but
security reports are still welcome.

## Reporting a vulnerability

Please report privately through GitHub's
[private vulnerability reporting](https://github.com/Maleckidd/KeepTaste/security/advisories/new)
("Security" tab → "Report a vulnerability"). Do not open a public issue.
Include the app version (shown at the bottom of Settings), the
steps or a crafted file that reproduces it, and the impact you see.

This is a one-person project with no service-level commitment: expect an
acknowledgement within a couple of weeks. Fixes ship as a Google Play update.

## Threat model

KeepTaste is a local-only Android app. There is no KeepTaste server, no
account and no analytics. The assets are the user's recipe library, photos,
shopping lists and settings, stored in the app's private sandbox (SQLite +
the documents directory). The attacker considered here is someone who gets
**content** in front of the app: a web page the user imports, text shared
into it, a backup file someone hands them, or a link. Someone with root or
physical access to an unlocked phone is out of scope. The database is not
encrypted beyond what Android's per-app sandbox and device encryption
provide.

### Entry points

| Entry point | What comes in | Controls | Residual risk |
|---|---|---|---|
| **Share target** (`text/*`, `expo-share-intent` in `app.json`) | Any text another app shares to KeepTaste | `utils/sharedUrl.ts` takes only the first `http(s)://` URL, or treats the text as a paste. The share opens the import sheet; nothing is saved until the user confirms the form. | A shared link is fetched immediately (see next row). |
| **Import from a link** (`utils/recipeImportFetch.ts`) | The HTML of a page whose address the user pasted or shared | This is the app's only intentional network call: one `GET`, from the phone straight to that site, 15 s timeout. The HTML is parsed as data by pure parsers (`utils/recipeImport.ts`: JSON-LD, microdata, text). There is no WebView and no script execution. The result only pre-fills the form. | The response body is read without a size cap (memory pressure on a hostile page). Browser-like headers are sent so recipe sites answer. |
| **`.zip` backup restore** (`utils/backupArchiveFs.ts`, `utils/backupArchive.ts`, `db/backup.ts`) | An archive from anywhere: email, a cloud folder, another phone | Unzip is guarded against path traversal by react-native-zip-archive (ZipSecurity). `backup.json` is validated before anything is wiped: schema version, required ids and names. **Image paths are restricted to a flat file name under `images/`**; anything else restores without a photo. Rows go in through Drizzle's parameterised queries. A Replace restore writes a safety backup of the current library first. | A crafted but valid archive can still fill the library with junk. That is a restore the user chose, and the safety backup undoes it. |
| **`.md` import** (`utils/importMarkdown.ts`, `db/import.ts`) | Markdown text | Parsed as plain text into fields; never executed. | — |
| **Markdown rendering** (`react-native-markdown-display`, through `components/recipe/RecipeMarkdown.tsx`) | Recipe ingredients and instructions | Rendered to native views, never HTML: the parser has `html: false` and `linkify: false`. Links open only when tapped. **Images are never fetched:** the library would load any `![](https://…)` URL, which works as a tracking pixel in a pasted, imported or restored recipe. The wrapper renders an image as its alt text instead, and ESLint (`no-restricted-imports`) keeps other files from using the renderer directly. Covered by `e2e/privacy.spec.ts`. | Quadratic-time parser advisories: see the allowlist below. |
| **Cookbook → PDF** (`utils/cookbookPdfHtml.ts`, `utils/cookbookPdf.ts`) | Recipe and cookbook text, which may come from an import, a paste or a restored backup | The app's only HTML sink: the text is laid out as an HTML page that `expo-print` renders off-screen (in a system WebView on Android) into a PDF file, so markup there would be live. Every user string goes through `escapeHtml` (`&`, `<`, `>`, `"`, `'`) and lands as text, never as a tag or an attribute. Covered by `__tests__/cookbookPdfHtml.test.ts`. | — |
| **Deep links** (`keeptaste://` scheme, Expo Router) | A route such as `keeptaste://cookbook/all` | Navigation only. Every write needs taps in the UI. Deletes wait behind a 5-second Undo, and recipes and cookbooks also ask for confirmation first. | A crafted query string can stall the router (decode-uri-component advisory below). |
| **AI transcription** (`utils/aiTranscribe.ts`) | An answer the user pastes back from an assistant of their choice | The app builds the prompt and cleans the pasted answer. It makes no AI or network call itself. | — |

### Permissions

`app.json` declares only **Camera** (recipe photos, OCR import) and
**exact alarms** (cooking-timer alarms). The notification permission, which
`expo-notifications` adds, is requested when the first timer starts. These
are explicitly **blocked** so that no library can merge them in:
`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ/WRITE_EXTERNAL_STORAGE`,
`RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW`. Photos come through the system
photo picker and backups through the Storage Access Framework. Both are
scoped to what the user picks and need no storage permission.

## Supply chain

**GitHub Actions are pinned to full commit SHAs**, with the release tag in a
comment (`uses: actions/checkout@<sha> # v7.0.1`). A tag can be moved to
point at different code; a SHA cannot. That is how the
`tj-actions/changed-files` compromise (March 2025, CVE-2025-30066) reached
thousands of repositories: the attacker re-pointed the action's version tags
at a commit that dumped CI secrets into the logs. Dependabot keeps the pins
current (`.github/dependabot.yml`; Expo-pinned packages and major versions are left to manual SDK upgrades).

**Least-privilege tokens.** Every workflow sets `permissions: contents: read`
at the top and widens it per job only where needed (CodeQL's
`security-events: write`). Checkouts use `persist-credentials: false`, so the
token is not left in `.git/config` for later steps.

**Checks on every pull request** (`.github/workflows/`):

| Check | What it gates |
|---|---|
| `security.yml` → gitleaks | Secrets anywhere in the git history of the change |
| `security.yml` → audit-ci | Known advisories (moderate and above) in `package-lock.json`, against the allowlist below |
| `security.yml` → dependency review | New or changed dependencies with known advisories |
| `codeql.yml` | Static analysis, `security-extended` query suite |

CodeQL and dependency review need GitHub code scanning / the dependency
graph, which are free for public repositories only. While this repository is
private, both jobs are skipped rather than failed.

## Dependency audit allowlist

`npm audit fix` (without `--force`) was run on 2026-11-18, and the unused
`drizzle-kit` dev dependency was removed (the app does not use Drizzle Kit
migrations, see CLAUDE.md). That took `npm audit` from 30 findings (2
critical, 15 high) to 11 (6 high, 5 moderate). What remains has no
non-breaking fix. `audit-ci.jsonc` allowlists each one by advisory id, so a
new advisory in the same package still fails CI.

### Reaches the shipped app

**markdown-it 10 / linkify-it 2**, through `react-native-markdown-display@7`,
which renders recipe ingredients and instructions.

| Advisory | Severity | Reachable? |
|---|---|---|
| GHSA-r7fv-28h4-cvq7, GHSA-6v5v-wf23-fmfq (quadratic smartquotes) | high, moderate | Yes. The renderer's default parser has `typographer: true`. |
| GHSA-6vfc-qv3f-vr6c (resource consumption) | moderate | Yes, in principle. |
| GHSA-253c-mchw-3w2r, GHSA-22p9-wv53-3rq4, GHSA-v245-v573-v5vm (linkify) | moderate, high, high | No. `linkify` is off in the renderer's parser. |

- *Input:* recipe text on the device. It gets there by typing, by importing
  a `.md` / `.zip` backup, from the share sheet, or from a web page the user
  chose to import (`utils/recipeImportFetch.ts`).
- *Impact:* a crafted recipe can make its own screen slow to render (CPU
  only, local). No code execution, no data access, nothing leaves the device.
- *Why no fix:* the renderer pins `markdown-it@^10`. The patched releases
  (14.3.2+) are four majors ahead with a changed token API. Forcing an
  override would mean on-device regression testing of every markdown rule
  the app renders.
- *Options if this ever matters:* pass the renderer a parser with
  `typographer: false`, which takes the reachable smartquotes rule out at
  the cost of typographic quotes, or replace the renderer.

**decode-uri-component 0.2**, through `expo-router@57` → `query-string@7`
(GHSA-qr28-fpjm-wq7f high, GHSA-vcc3-ghjq-m6fr moderate).

- *Input:* the query string of a route URL, for example a `keeptaste://`
  deep link that the user opens.
- *Impact:* a crafted link can stall the JS thread while it is decoded, so
  the app freezes until it is killed. Local and user-initiated, with no data
  impact.
- *Why no fix:* the patched `decode-uri-component@0.5` is an ESM-only major
  that `query-string@7` does not support. `expo-router@58` needs the Expo SDK
  58 upgrade.

### Build tooling only, never in the app bundle

| Package | Advisory | Pulled in by |
|---|---|---|
| image-size 1.x | GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr (high, parser loops) | Metro (the bundler). It only reads this repo's own image assets. |
| minimatch 3–10 | GHSA-g3hv-75wg-m249 (moderate, glob amplification) | ESLint, Jest, `@expo/fingerprint`. Globs come from this repo's config. |

Exploiting either would need an attacker-controlled glob or image inside the
build, which already means a compromised repository.

### Review

These entries are revisited on every Dependabot update and at the next Expo
SDK upgrade, which is expected to clear the `expo-router` chain. audit-ci
prints any allowlisted advisory it no longer finds, so a stale entry shows up
in the CI log.
