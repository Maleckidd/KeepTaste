// Build a ready-to-import demo archive (keeptaste-demo.zip) from the curated
// assets/store/demo-import.md + the food photos in the same folder. Reuses the
// app's own pure modules (parseBackupMarkdown, buildBackupJson) so the output
// is byte-for-byte the format the mobile import expects (SPEC.md §5.17.1).
//
// Run from the repo root:
//   npx --yes tsx scripts/build-demo-backup.ts        # English demo
//   npx --yes tsx scripts/build-demo-backup.ts pl     # Polish demo
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { parseBackupMarkdown } from '../utils/importMarkdown';
import { buildBackupJson, type BackupContent } from '../utils/backupArchive';
import type {
  Recipe,
  Cookbook,
  ShoppingList,
  ShoppingItem,
} from '../db/schema';

const STORE = path.resolve('assets/store');

// Photos are read from assets/store/crops/ — the same source shots cropped to
// the dish, so a recipe card shows food rather than the whole staged table
// (the wide originals stay in assets/store/ as the master copies). The zip
// entry keeps the plain file name either way.
const PHOTOS = path.join(STORE, 'crops');

type DemoLocale = {
  /** Curated Markdown source, relative to assets/store/. */
  markdown: string;
  /** Output archive name, relative to assets/store/. */
  output: string;
  /** Cookbook cover photo by cookbook name. */
  covers: Record<string, string>;
  /** Per-recipe photo by recipe title (only the ones we have shots for). */
  recipeImages: Record<string, string>;
  /** Sample shopping list: name + [item, quantity, checked] rows. */
  shoppingList: {
    name: string;
    items: Array<[string, string | null, 0 | 1]>;
  };
};

const LOCALES: Record<string, DemoLocale> = {
  en: {
    markdown: 'demo-import.md',
    output: 'keeptaste-demo.zip',
    covers: {
      'Italian Kitchen': 'italian.png',
      Desserts: 'dessert.png',
      'Weekday Dinners': 'dinner.png',
      Breakfasts: 'breakfast.png',
    },
    recipeImages: {
      'Ricotta Pancakes': 'pancakes.png',
      'Banana Oatmeal with Nuts': 'oatmeal.png',
      'Fried Eggs on Sourdough with Avocado': 'fried-eggs.png',
    },
    shoppingList: {
      name: 'Weekend Shopping',
      items: [
        ['Spaghetti', '500 g', 0],
        ['Pancetta', '200 g', 0],
        ['Eggs', '1 dozen', 1],
        ['Parmesan', '100 g', 1],
        ['Arborio rice', null, 0],
        ['Salmon fillets', '2', 0],
        ['Cherry tomatoes', null, 0],
        ['Bananas', null, 1],
        ['Rolled oats', null, 0],
        ['Dark chocolate', null, 0],
      ],
    },
  },
  pl: {
    markdown: 'demo-import.pl.md',
    output: 'keeptaste-demo-pl.zip',
    covers: {
      'Kuchnia włoska': 'italian.png',
      Desery: 'dessert.png',
      'Obiady na co dzień': 'dinner.png',
      Śniadania: 'breakfast.png',
    },
    recipeImages: {
      'Placki ricotta': 'pancakes.png',
      'Owsianka bananowa z orzechami': 'oatmeal.png',
      'Jajka sadzone na zakwasie z awokado': 'fried-eggs.png',
    },
    shoppingList: {
      name: 'Zakupy na weekend',
      items: [
        ['Spaghetti', '500 g', 0],
        ['Pancetta', '200 g', 0],
        ['Jajka', '10 szt.', 1],
        ['Parmezan', '100 g', 1],
        ['Ryż arborio', null, 0],
        ['Filety z łososia', '2', 0],
        ['Pomidorki koktajlowe', null, 0],
        ['Banany', null, 1],
        ['Płatki owsiane', null, 0],
        ['Gorzka czekolada', null, 0],
      ],
    },
  },
};

async function main(): Promise<void> {
  const key = process.argv[2] ?? 'en';
  const locale = LOCALES[key];
  if (!locale) {
    throw new Error(
      `unknown locale "${key}" — expected one of: ${Object.keys(LOCALES).join(', ')}`
    );
  }
  const COVERS = locale.covers;
  const RECIPE_IMG = locale.recipeImages;

  const md = fs.readFileSync(path.join(STORE, locale.markdown), 'utf8');
  const parsed = parseBackupMarkdown(md);
  if (!parsed.ok) {
    throw new Error(`${locale.markdown} parse failed: ${parsed.error}`);
  }

  const usedImages = new Set<string>();
  const cookbooks: Cookbook[] = [];
  const recipes: Recipe[] = [];
  let cookbookId = 1;
  let recipeId = 1;

  // Stagger timestamps so the app's "newest first" sort is deterministic and
  // the library looks naturally built up over time.
  const base = Date.parse('2026-06-13T12:00:00.000Z');
  let tick = 0;
  const stamp = (): string => new Date(base - tick++ * 60_000).toISOString();

  for (const section of parsed.sections) {
    let cbId: number | null = null;
    if (section.cookbookName !== null) {
      cbId = cookbookId++;
      const cover = COVERS[section.cookbookName] ?? null;
      if (cover) usedImages.add(cover);
      cookbooks.push({
        id: cbId,
        name: section.cookbookName,
        coverImagePath: cover ? `images/${cover}` : null,
        createdAt: stamp(),
      });
    }
    for (const r of section.recipes) {
      const img = RECIPE_IMG[r.title] ?? null;
      if (img) usedImages.add(img);
      const ts = stamp();
      recipes.push({
        id: recipeId++,
        cookbookId: cbId,
        title: r.title,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        servings: r.servings,
        imagePath: img ? `images/${img}` : null,
        ingredients: r.ingredients,
        instructions: r.instructions,
        notes: r.notes,
        toTry: r.toTry ? 1 : 0,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  // A sample shopping list, themed to the demo recipes — a couple already in
  // the cart (checked) so the two-section list view (§5.10) is visible.
  const listTs = stamp();
  const shoppingLists: ShoppingList[] = [
    {
      id: 1,
      name: locale.shoppingList.name,
      createdAt: listTs,
      updatedAt: listTs,
    },
  ];
  const sampleItems = locale.shoppingList.items;
  const shoppingItems: ShoppingItem[] = sampleItems.map(
    ([name, quantity, checked], i) => ({
      id: i + 1,
      listId: 1,
      name,
      quantity,
      checked,
      createdAt: stamp(),
    })
  );

  const content: BackupContent = {
    cookbooks,
    recipes,
    shoppingLists,
    shoppingItems,
    settings: [],
  };

  const zip = new JSZip();
  zip.file('backup.json', buildBackupJson(content));
  zip.file('recipes.md', md);
  for (const img of usedImages) {
    zip.file(`images/${img}`, fs.readFileSync(path.join(PHOTOS, img)));
  }

  const out = path.join(STORE, locale.output);
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer' }));
  console.log(
    `Wrote ${out} — ${cookbooks.length} cookbooks, ${recipes.length} recipes, ` +
      `${usedImages.size} images, ${shoppingLists.length} shopping list (${shoppingItems.length} items)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
