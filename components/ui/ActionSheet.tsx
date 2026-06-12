import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTheme,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
  Touch,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';

export type ActionSheetAction = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  /** Usually the name of the object the actions apply to. */
  title?: string;
  actions: ActionSheetAction[];
  onClose: () => void;
};

// Themed bottom action sheet replacing Alert.alert-based context menus.
// Deliberately NOT built on RN's native <Modal>: on Android a transparent
// Modal that is toggled while dismissing (or followed by an Alert/navigation)
// can leak its native window, leaving a dimmed, touch-blocking ghost layer.
// A plain absolutely-positioned overlay stays fully under React's control.
// Requires being rendered as a direct child of the screen's root container.
export default function ActionSheet({ visible, title, actions, onClose }: Props) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();

  // Stays mounted while the exit animation plays out.
  const [rendered, setRendered] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(360);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: Motion.duration.base,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: Motion.duration.fast,
      useNativeDriver: true,
    }).start();
    // Unmount on a timer, not the animation callback — when frames are
    // throttled (e.g. a hidden web tab) the callback never fires and the
    // sheet would stay mounted forever.
    const timer = setTimeout(() => setRendered(false), Motion.duration.fast + 50);
    return () => clearTimeout(timer);
  }, [visible, progress]);

  // Without a native Modal the hardware back button would pop the screen —
  // intercept it to close the sheet instead (what Modal's onRequestClose did).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  const run = (action: ActionSheetAction) => {
    onClose();
    // Let the sheet start dismissing before the action navigates or alerts.
    setTimeout(action.onPress, 0);
  };

  if (!rendered) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  return (
    <View style={styles.root} accessibilityViewIsModal pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel={t('a11y.close')}
        />
      </Animated.View>
      <Animated.View
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          {
            backgroundColor: c.surface,
            paddingBottom: insets.bottom + Spacing.sm,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: c.border }]} />
        {title ? (
          <Text
            style={[styles.title, { color: c.textSecondary }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        ) : null}
        {actions.map((action, index) => (
          <Pressable
            key={index}
            onPress={() => run(action)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [
              styles.action,
              pressed && { backgroundColor: c.surfaceAlt },
            ]}
          >
            {action.icon ? (
              <Ionicons
                name={action.icon}
                size={22}
                color={action.destructive ? c.error : c.text}
              />
            ) : null}
            <Text
              style={[
                styles.actionLabel,
                { color: action.destructive ? c.error : c.text },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.cancel,
            { borderTopColor: c.border },
            pressed && { backgroundColor: c.surfaceAlt },
          ]}
        >
          <Text style={[styles.cancelLabel, { color: c.textSecondary }]}>
            {t('common.cancel')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 1000,
    // Android stacks by elevation, not zIndex, within the same parent.
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    ...Shadow.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: Touch.list,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.md,
  },
  actionLabel: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.medium,
  },
  cancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: Touch.min,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
  },
  cancelLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
  },
});
