import ExactAlarmModule from './src/ExactAlarmModule';

/**
 * Whether Android lets this app schedule exact alarms ("Alarms & reminders",
 * SCHEDULE_EXACT_ALARM). expo-notifications uses an exact alarm whenever this
 * is true; otherwise the timer alarm is inexact and may ring up to 3/4 of the
 * duration late. A missing native module (older build, Expo Go) or an error
 * counts as allowed, so the user is never nagged about something we can't fix.
 */
export function canScheduleExactAlarms(): boolean {
  if (!ExactAlarmModule) return true;
  try {
    return ExactAlarmModule.canScheduleExactAlarms();
  } catch {
    return true;
  }
}

/** Opens the system "Alarms & reminders" screen for this app; no-op if unavailable. */
export async function openExactAlarmSettings(): Promise<void> {
  if (!ExactAlarmModule) return;
  await ExactAlarmModule.openExactAlarmSettings();
}
