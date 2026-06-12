// Layout animation helper. Wraps LayoutAnimation so list changes (checking
// off a shopping item, deleting a row) animate subtly — and not at all when
// the user has reduce-motion enabled at the system level.
import {
  AccessibilityInfo,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Motion } from '@/constants/theme';

let reduceMotion = false;

// Old-architecture Android needs the experimental switch for LayoutAnimation.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

AccessibilityInfo.isReduceMotionEnabled()
  .then((enabled) => {
    reduceMotion = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
  reduceMotion = enabled;
});

export function animateLayout(duration: number = Motion.duration.base): void {
  if (reduceMotion || Platform.OS === 'web') return;
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      duration,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity
    )
  );
}
