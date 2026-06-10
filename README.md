# KeepTaste

A private, local-only app for storing and managing cooking recipes.
Built with React Native + Expo. Works fully offline — no accounts, no cloud, no ads.
The escape hatch is Markdown export: your recipes are always readable outside the app.

See [SPEC.md](SPEC.md) for the full product specification and [TESTING.md](TESTING.md) for the manual test plan.

## Tech stack

- **Expo SDK 52** + **Expo Router 4** (file-based navigation)
- **expo-sqlite** + **Drizzle ORM** (local database)
- **react-native-markdown-display** (Markdown rendering)
- **expo-image-picker** (photos from gallery and camera)
- **expo-file-system** + **expo-sharing** (export to .md file)
- **TypeScript** (strict mode)

## Project structure

```
app/
  _layout.tsx          ← root layout, DB initialization
  index.tsx            ← home screen, cookbook tiles + settings entry
  settings.tsx         ← app info, no-backup notice, delete all data
  cookbook/
    [id].tsx           ← recipe list in a cookbook (id="all" = all recipes)
    new.tsx            ← new cookbook modal
    edit.tsx           ← edit cookbook modal
  recipe/
    [id].tsx           ← recipe view with Markdown
    new.tsx            ← new recipe form
    edit.tsx           ← edit recipe form

components/
  cookbook/
    CookbookForm.tsx   ← shared cookbook form (new + edit)
  recipe/
    RecipeForm.tsx     ← shared recipe form (new + edit)

db/
  schema.ts            ← Drizzle schema (types + tables)
  ddl.ts               ← migration DDL shared by native and web clients
  client.ts            ← SQLite connection, SQL migrations
  client.web.ts        ← in-memory sql.js client (web test build only)
  cookbooks.ts         ← cookbook queries
  recipes.ts           ← recipe queries + delete-all-data

utils/
  markdown.ts          ← export of a whole cookbook to a .md file
  imageStorage.ts      ← persisting picked images + file cleanup
  cookbookForm.ts      ← cookbook form logic (normalize, dirty-check)
  recipeForm.ts        ← recipe form logic (mapping, dirty-check)
  numeric.ts           ← numeric field parsing (integer ≥ 1 or null)
  search.ts            ← diacritics-safe title search

constants/
  theme.ts             ← colors, typography, spacing, shadows
```

## Installation

```bash
npm install
npx expo start
```

Then scan the QR code in the **Expo Go** app (Android/iOS).

## Running on Android

```bash
npm run android
```

Requires Android Studio with a running emulator, or a connected device with USB debugging enabled. To build an installable release APK:

```bash
npx expo prebuild -p android
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

## Testing

```bash
npm test             # unit tests (pure logic: db helpers, utils)
npx tsc --noEmit     # strict type check
npm run web          # web build — browser smoke-test environment only
```

Manual test plan for native behavior (Alerts, image picker, file persistence, share sheet): [TESTING.md](TESTING.md).

## Markdown export format

A whole cookbook is exported to a single `.md` file:

```markdown
# Cookbook Name

*Exported: 01/06/2026*
*Recipes: 12*

---

## Recipe Title

**Prep:** 15 min | **Cook:** 45 min | **Servings:** 4

### Ingredients
...

### Instructions
...

### Notes
...

---
```

## Database schema

```sql
cookbooks (id, name, cover_image_path, created_at)
recipes   (id, cookbook_id FK, title, prep_time, cook_time,
           servings, image_path, ingredients, instructions,
           notes, created_at, updated_at)
```

Deleting a cookbook sets `cookbook_id` to NULL on its recipes — they survive under "All recipes".

## Roadmap

Open items are tracked in [SPEC.md §8](SPEC.md); out-of-scope decisions in §7.

## License

[MIT](LICENSE)
