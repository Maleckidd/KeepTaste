// Availability gate for the Android share-target native module (SPEC §5.15).
// Mirrors utils/recipeOcr.ts (`isOcrAvailable`): expo-share-intent ships its JS
// in every runtime, but its native module is absent in Expo Go and on web. We
// expose a single boolean so the root layout can skip mounting the share
// handler entirely when the module isn't linked, keeping Expo Go usable.
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

// requireOptionalNativeModule returns null (never throws) when the native side
// isn't linked — the same signal the library's own hook guards on internally.
export const isShareIntentAvailable: boolean =
  Platform.OS === 'android' &&
  requireOptionalNativeModule('ExpoShareIntentModule') != null;
