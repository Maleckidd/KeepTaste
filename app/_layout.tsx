import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { runMigrations } from '@/db/client';
import { useTheme } from '@/constants/theme';
import { LanguageProvider, useT } from '@/i18n/LanguageProvider';

function RootStack() {
  const c = useTheme();
  const t = useT();

  return (
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
        options={{ title: t('stack.cookbook') }}
      />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen
        name="recipe/[id]"
        options={{ title: t('stack.recipe'), presentation: 'card' }}
      />
      <Stack.Screen
        name="recipe/new"
        options={{ title: t('stack.newRecipe'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="recipe/edit"
        options={{ title: t('stack.editRecipe'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="recipe/add-to-list"
        options={{ title: t('stack.addToList'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="shopping/[id]"
        options={{ title: t('stack.shoppingList'), presentation: 'card' }}
      />
      <Stack.Screen
        name="shopping/new"
        options={{ title: t('stack.newShoppingList'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="shopping/edit"
        options={{ title: t('stack.renameList'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="cookbook/new"
        options={{ title: t('stack.newCookbook'), presentation: 'modal' }}
      />
      <Stack.Screen
        name="cookbook/edit"
        options={{ title: t('stack.editCookbook'), presentation: 'modal' }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Run database migrations on app startup (creates app_settings, used by
    // LanguageProvider). Provider tolerates the table appearing late.
    try {
      runMigrations();
    } catch (e) {
      console.error('Database migration error:', e);
    }
  }, []);

  return (
    <LanguageProvider>
      <StatusBar style="auto" />
      <RootStack />
    </LanguageProvider>
  );
}
