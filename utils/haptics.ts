// Light haptic tap for quick confirmations (checking off a shopping item).
// No-op on web and when the device doesn't support haptics.
import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

export async function lightTap(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics unavailable — silently skip.
  }
}

// Timer-done alarm (SPEC.md §5.21): a three-pulse vibration that repeats until
// stopTimerAlert(), plus a warning haptic once on native. This is the in-app
// alert; the background alarm is the OS notification (utils/timerAlarm.ts),
// whose channel vibrates with the same pattern and, being insistent, loops it
// too. The trailing 800 ms pause separates the repeats — both the in-app
// repeat and the insistent notification restart the pattern from index 0.
// Errors are swallowed (vibration may be unsupported).
export const ALARM_PATTERN = [0, 400, 200, 400, 200, 400, 800];

export function timerDoneAlert(): void {
  try {
    Vibration.vibrate(ALARM_PATTERN, true);
  } catch {
    // Vibration unavailable — skip.
  }
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
    // Haptics unavailable — skip.
  });
}

/** Stops the repeating timer-done vibration. Never throws. */
export function stopTimerAlert(): void {
  try {
    Vibration.cancel();
  } catch {
    // Vibration unavailable — nothing to stop.
  }
}
