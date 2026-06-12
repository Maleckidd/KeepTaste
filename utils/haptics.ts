// Light haptic tap for quick confirmations (checking off a shopping item).
// No-op on web and when the device doesn't support haptics.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export async function lightTap(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics unavailable — silently skip.
  }
}
