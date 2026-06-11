import { eq } from 'drizzle-orm';
import { db } from './client';
import { appSettings } from './schema';

/** Reads a single key/value setting, or null when absent. */
export async function getSetting(key: string): Promise<string | null> {
  const result = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return result[0]?.value ?? null;
}

/** Upserts a key/value setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
