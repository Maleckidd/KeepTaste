# scripts/

One-off build/maintenance scripts. Not part of the app bundle.

## build-demo-backup.ts

Builds a ready-to-import **demo backup archive** from the curated content in
`assets/store/`:

- `assets/store/demo-import.md` — the demo recipes (4 cookbooks, 14 recipes), in
  the §5.6 Markdown format
- `assets/store/*.png` — cookbook covers (`italian`, `dessert`, `dinner`,
  `breakfast`) and recipe photos (`pancakes`, `oatmeal`, `fried-eggs`)

It reuses the app's own pure modules (`parseBackupMarkdown`, `buildBackupJson`)
so the output is byte-for-byte the format the mobile import expects
(SPEC.md §5.17.1): a `.zip` containing `backup.json` + `recipes.md` + `images/`,
plus a sample shopping list.

Run from the repo root:

```bash
npx --yes tsx scripts/build-demo-backup.ts
```

Output: **`assets/store/keeptaste-demo.zip`** — a complete library a user can
restore via Settings → Restore backup (recipes, photos, and a shopping list).

### Generated / ignored artifacts

These are products of a build and are **git-ignored** (regenerate as needed):

| File | What it is | How to regenerate |
|---|---|---|
| `assets/store/keeptaste-demo.zip` | Demo backup for import/onboarding | `npx tsx scripts/build-demo-backup.ts` |
| `keeptaste.apk` | Local Android build output | `eas build -p android --profile preview --local --output ./keeptaste.apk` (needs `ANDROID_HOME` set) |
| `eas-build.log` | Transient EAS build log | produced by the build above |
