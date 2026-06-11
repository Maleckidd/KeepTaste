# KeepTaste

A private, local-only app for storing and managing cooking recipes — plus simple
shopping lists. Built with React Native + Expo. Works fully offline — no accounts,
no cloud, no ads. The escape hatch is Markdown export: your recipes are always
readable outside the app, and previously exported files can be imported back.

**Features:** cookbooks with covers, recipes with Markdown ingredients/instructions,
diacritics-safe search, Markdown export & import, shopping lists with an "in cart"
flow, dark mode (follows the system), bilingual UI (English/Polish, selectable in
Settings).

See [SPEC.md](SPEC.md) for the full product specification and [TESTING.md](TESTING.md) for the manual test plan.

## Tech stack

- **Expo SDK 52** + **Expo Router 4** (file-based navigation, bottom tabs)
- **expo-sqlite** + **Drizzle ORM** (local database)
- **react-native-markdown-display** (Markdown rendering)
- **expo-image-picker** (photos from gallery and camera)
- **expo-file-system** + **expo-sharing** (export to .md file)
- **expo-document-picker** (import a previously exported .md file)
- **expo-localization** (system-locale detection for the bilingual UI)
- **TypeScript** (strict mode)

## Project structure

```
app/
  _layout.tsx          ← root Stack, DB init, LanguageProvider
  (tabs)/
    _layout.tsx        ← bottom tab bar: Recipes + Shopping
    index.tsx          ← Recipes tab: cookbook grid + settings entry
    shopping.tsx       ← Shopping tab: list of shopping lists
  settings.tsx         ← app info, language, import, delete all data
  cookbook/
    [id].tsx           ← recipe list in a cookbook (id="all" = all recipes + search)
    new.tsx            ← new cookbook modal
    edit.tsx           ← edit cookbook modal
  recipe/
    [id].tsx           ← recipe view with Markdown
    new.tsx            ← new recipe form
    edit.tsx           ← edit recipe form
  shopping/
    [id].tsx           ← shopping list detail (items, "in cart" flow)
    new.tsx            ← new shopping list modal
    edit.tsx           ← rename shopping list modal

components/
  cookbook/
    CookbookForm.tsx   ← shared cookbook form (new + edit)
  recipe/
    RecipeForm.tsx     ← shared recipe form (new + edit)

i18n/
  dictionary.ts        ← typed EN+PL dictionary of all UI strings
  LanguageProvider.tsx ← language context (useT/useLanguage), persistence

db/
  schema.ts            ← Drizzle schema (types + tables)
  ddl.ts               ← migration DDL shared by native and web clients
  client.ts            ← SQLite connection, SQL migrations
  client.web.ts        ← in-memory sql.js client (web test build only)
  cookbooks.ts         ← cookbook queries
  recipes.ts           ← recipe queries + delete-all-data
  shoppingLists.ts     ← shopping list/item queries
  settings.ts          ← key-value app settings (language preference)
  import.ts            ← writes a parsed Markdown import

utils/
  markdown.ts          ← export of a whole cookbook to a .md file
  importMarkdown.ts    ← parser for previously exported .md files
  imageStorage.ts      ← persisting picked images + file cleanup
  i18n.ts              ← pure i18n logic (locale resolution, interpolation, PL plurals)
  cookbookForm.ts      ← cookbook form logic (normalize, dirty-check)
  recipeForm.ts        ← recipe form logic (mapping, dirty-check)
  shoppingList.ts      ← shopping list logic (partition, counts, input normalization)
  numeric.ts           ← numeric field parsing (integer ≥ 1 or null)
  search.ts            ← diacritics-safe title search

constants/
  theme.ts             ← light/dark palettes + useTheme(), typography, spacing, shadows
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
cookbooks      (id, name, cover_image_path, created_at)
recipes        (id, cookbook_id FK, title, prep_time, cook_time,
                servings, image_path, ingredients, instructions,
                notes, created_at, updated_at)
shopping_lists (id, name, created_at, updated_at)
shopping_items (id, list_id FK CASCADE, name, quantity, checked, created_at)
app_settings   (key, value)
```

Deleting a cookbook sets `cookbook_id` to NULL on its recipes — they survive under
"All recipes". Deleting a shopping list cascades to its items.

## Roadmap

Open items are tracked in [SPEC.md §8](SPEC.md); out-of-scope decisions in §7.

## License

[MIT](LICENSE)
