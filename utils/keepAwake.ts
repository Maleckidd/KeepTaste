// Keeps the screen on while the recipe view is open (cooking context).
// expo-keep-awake's useKeepAwake() rejects unhandled on web when the browser
// denies the Wake Lock permission, so this wrapper activates manually and
// swallows failures — losing keep-awake is never worth a crash.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const TAG = 'recipe-view';

export function useKeepAwakeSafe(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(TAG).catch(() => {});
    };
  }, []);
}
