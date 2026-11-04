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

// Timer-done alarm (SPEC.md §5.21): a three-pulse vibration that plays once,
// plus a warning haptic on native. Foreground only — stage 1 has no
// notifications. Errors are swallowed (vibration may be unsupported).
const ALARM_PATTERN = [0, 400, 200, 400, 200, 400];

export function timerDoneAlert(): void {
  try {
    Vibration.vibrate(ALARM_PATTERN);
  } catch {
    // Vibration unavailable — skip.
  }
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
    // Haptics unavailable — skip.
  });
}
