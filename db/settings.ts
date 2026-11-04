import { eq } from 'drizzle-orm';
import { db } from './client';
import { appSettings } from './schema';
import { ACTIVE_TIMERS_KEY } from './settingKeys';

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

// --- First-launch sample seed flags (SPEC.md §5.20) ---

/** Set once the sample content has been offered (or deliberately skipped). */
const DEMO_SEEDED_KEY = 'demo_seeded';
/** Set the first time the user makes a real (non-seed) mutation. */
const USER_EDITED_KEY = 'user_edited';

/** True once the first-launch sample seed has run (or been skipped). */
export async function isDemoSeeded(): Promise<boolean> {
  return (await getSetting(DEMO_SEEDED_KEY)) === '1';
}

/** Marks the sample seed as handled so it never runs again. */
export async function markDemoSeeded(): Promise<void> {
  await setSetting(DEMO_SEEDED_KEY, '1');
}

/** True once the user has made at least one real edit to their library. */
export async function isUserEdited(): Promise<boolean> {
  return (await getSetting(USER_EDITED_KEY)) === '1';
}

/** Records that the user has edited real data (distinguishes a pristine seed). */
export async function markUserEdited(): Promise<void> {
  await setSetting(USER_EDITED_KEY, '1');
}

// --- Cooking timers (SPEC.md §5.21) ---

/** Raw JSON of the running timers (parsed by utils/timers parseStoredTimers). */
export async function getActiveTimersJson(): Promise<string | null> {
  return getSetting(ACTIVE_TIMERS_KEY);
}

/** Persists the running timers. Not a library edit: no auto-backup trigger. */
export async function saveActiveTimersJson(json: string): Promise<void> {
  await setSetting(ACTIVE_TIMERS_KEY, json);
}
