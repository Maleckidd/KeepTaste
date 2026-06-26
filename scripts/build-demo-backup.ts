// Build a ready-to-import demo archive (keeptaste-demo.zip) from the curated
// assets/store/demo-import.md + the food photos in the same folder. Reuses the
// app's own pure modules (parseBackupMarkdown, buildBackupJson) so the output
// is byte-for-byte the format the mobile import expects (SPEC.md §5.17.1).
//
// Run from the repo root:  npx --yes tsx scripts/build-demo-backup.ts
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

// Cookbook cover photo by cookbook name.
const COVERS: Record<string, string> = {
  'Italian Kitchen': 'italian.png',
  Desserts: 'dessert.png',
  'Weekday Dinners': 'dinner.png',
  Breakfasts: 'breakfast.png',
};

// Per-recipe photo by recipe title (only the ones we have shots for).
const RECIPE_IMG: Record<string, string> = {
  'Ricotta Pancakes': 'pancakes.png',
  'Banana Oatmeal with Nuts': 'oatmeal.png',
  'Fried Eggs on Sourdough with Avocado': 'fried-eggs.png',
};

async function main(): Promise<void> {
  const md = fs.readFileSync(path.join(STORE, 'demo-import.md'), 'utf8');
  const parsed = parseBackupMarkdown(md);
  if (!parsed.ok) throw new Error(`demo-import.md parse failed: ${parsed.error}`);

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
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  // A sample shopping list, themed to the demo recipes — a couple already in
  // the cart (checked) so the two-section list view (§5.10) is visible.
  const listTs = stamp();
  const shoppingLists: ShoppingList[] = [
    { id: 1, name: 'Weekend Shopping', createdAt: listTs, updatedAt: listTs },
  ];
  const sampleItems: Array<[string, string | null, 0 | 1]> = [
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
  ];
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
    zip.file(`images/${img}`, fs.readFileSync(path.join(STORE, img)));
  }

  const out = path.join(STORE, 'keeptaste-demo.zip');
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
