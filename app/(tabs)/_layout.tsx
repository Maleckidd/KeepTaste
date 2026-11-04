import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar } from 'expo-router/js-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { useTimers } from '@/components/timers/TimerProvider';

export default function TabsLayout() {
  const c = useTheme();
  const t = useT();
  const { setTabBarHeight } = useTimers();

  return (
    <Tabs
      // Default bar, wrapped to report its height: the cooking-timer bar
      // floats just above it on tab routes (SPEC.md §5.21).
      tabBar={(props) => (
        <View onLayout={(e) => setTabBarHeight(e.nativeEvent.layout.height)}>
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.recipes'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: t('tabs.shopping'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
