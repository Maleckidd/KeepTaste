import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { runMigrations } from '@/db/client';
import { useTheme } from '@/constants/theme';

export default function RootLayout() {
  const c = useTheme();

  useEffect(() => {
    // Run database migrations on app startup
    try {
      runMigrations();
    } catch (e) {
      console.error('Database migration error:', e);
    }
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: c.background,
          },
          headerTintColor: c.text,
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 17,
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: c.background,
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="cookbook/[id]"
          options={{ title: 'Cookbook' }}
        />
        <Stack.Screen
          name="settings"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="recipe/[id]"
          options={{ title: 'Recipe', presentation: 'card' }}
        />
        <Stack.Screen
          name="recipe/new"
          options={{
            title: 'New recipe',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="recipe/edit"
          options={{
            title: 'Edit recipe',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="shopping/[id]"
          options={{ title: 'Shopping list', presentation: 'card' }}
        />
        <Stack.Screen
          name="shopping/new"
          options={{
            title: 'New shopping list',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="shopping/edit"
          options={{
            title: 'Rename list',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="cookbook/new"
          options={{
            title: 'New cookbook',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="cookbook/edit"
          options={{
            title: 'Edit cookbook',
            presentation: 'modal',
          }}
        />
      </Stack>
    </>
  );
}
