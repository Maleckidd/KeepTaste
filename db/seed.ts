// First-launch sample content (SPEC.md §5.20). Turns the localized data from
// utils/seedData.ts into ordinary, editable/deletable user recipes exactly once,
// guarded by the demo_seeded flag and an emptiness check so it never lands on
// top of real data. The one showcase recipe ships with a bundled photo that is
// copied into the document directory at seed time, so it behaves like any user
// photo (deletable with the recipe, included in .zip backups).
import { Asset } from 'expo-asset';
import { isDatabaseEmpty } from './backup';
import { isDemoSeeded, markDemoSeeded } from './settings';
import { createCookbook, updateCookbook } from './cookbooks';
import { createRecipe, updateRecipe } from './recipes';
import { withAutoBackupSuppressed } from '../utils/backupTrigger';
import { persistImage } from '../utils/imageStorage';
import { buildSeedContent } from '../utils/seedData';
import type { Language } from '../utils/i18n';

// Bundled showcase photos: the recipe photo and the cookbook cover. Separate
// files (not one shared copy) so deleting the seeded recipe — which removes its
// stored image — can never orphan the cookbook cover.
const RECIPE_PHOTO = require('../assets/images/seed/pancakes.jpg');
const COVER_PHOTO = require('../assets/images/seed/breakfast.jpg');

/**
 * Resolves a bundled seed photo to a local file and copies it into the
 * document directory (like a picked photo). Best-effort: returns null on any
 * failure or on web (where documentDirectory is null and persistImage passes
 * through) so the image step can never break seeding.
 */
async function persistSeedPhoto(module: number): Promise<string | null> {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    const localUri = asset.localUri ?? asset.uri;
    if (!localUri) return null;
    return await persistImage(localUri, null);
  } catch {
    return null;
  }
}

/**
 * Seeds the sample cookbook + recipe on first launch, once. Returns whether it
 * actually seeded.
 *
 * - No-op (returns false) once demo_seeded is set.
 * - If the library is not empty, just marks demo_seeded and returns false —
 *   belt-and-suspenders so we never seed on top of real data (e.g. a library
 *   that predates this feature).
 * - Otherwise inserts the localized content inside withAutoBackupSuppressed so
 *   the seed fires a single backup at the end and its own inserts skip the
 *   user_edited mark (the library stays a pristine seed, restorable silently).
 *   The bundled photos are attached to the recipe and the cookbook cover;
 *   a failed photo copy degrades gracefully to no image.
 */
export async function seedSampleContentIfNeeded(
  language: Language
): Promise<boolean> {
  if (await isDemoSeeded()) return false;

  if (!(await isDatabaseEmpty())) {
    await markDemoSeeded();
    return false;
  }

  const content = buildSeedContent(language);
  await withAutoBackupSuppressed(async () => {
    // Copy the bundled photos out first; null on failure means "no image".
    const photoPath = await persistSeedPhoto(RECIPE_PHOTO);
    const coverPath = await persistSeedPhoto(COVER_PHOTO);

    const cookbookId = await createCookbook({ name: content.cookbook.name });
    if (coverPath) {
      await updateCookbook(cookbookId, { coverImagePath: coverPath });
    }

    for (const r of content.recipes) {
      const recipeId = await createRecipe({
        cookbookId,
        title: r.title,
        prepTime: r.prepTime,
        cookTime: r.cookTime,
        servings: r.servings,
        imagePath: null,
        ingredients: r.ingredients,
        instructions: r.instructions,
        notes: r.notes,
        toTry: r.toTry,
      });
      // Single showcase recipe gets the bundled photo; if the copy failed the
      // recipe simply has no image (never blocks the seed).
      if (photoPath) {
        await updateRecipe(recipeId, { imagePath: photoPath });
      }
    }
  });

  await markDemoSeeded();
  return true;
}
