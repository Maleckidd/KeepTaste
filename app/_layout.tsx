import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { runMigrations } from '@/db/client';
import { runAutoBackupIfDue } from '@/utils/backupArchiveFs';
import { useTheme, darkColors, lightColors } from '@/constants/theme';
import { LanguageProvider, useT } from '@/i18n/LanguageProvider';
import { SnackbarProvider } from '@/components/ui/SnackbarProvider';

function RootStack() {
  const c = useTheme();
  const t = useT();

  return (
    <Stack
      screenOptions={{
        // Every screen renders its own header (ScreenHeader / ModalHeader /
        // form header) — the native bar would duplicate it.
        headerShown: false,
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
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="cookbook/[id]"
        options={{ title: t('stack.cookbook') }}
      />
      <Stack.Screen name="settings" />
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
  const scheme = useColorScheme();

  useEffect(() => {
    // Match the Android system navigation bar to the app background; otherwise
    // it stays white in dark mode. No-op on iOS/web.
    if (Platform.OS !== 'android') return;
    const palette = scheme === 'dark' ? darkColors : lightColors;
    NavigationBar.setBackgroundColorAsync(palette.background);
    NavigationBar.setButtonStyleAsync(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme]);

  useEffect(() => {
    // Run database migrations on app startup (creates app_settings, used by
    // LanguageProvider). Provider tolerates the table appearing late.
    try {
      runMigrations();
    } catch (e) {
      console.error('Database migration error:', e);
    }
    // Optional automatic backup (§5.17.3) — best-effort, silent, never blocks.
    void runAutoBackupIfDue();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <SnackbarProvider>
          <StatusBar style="auto" />
          <RootStack />
        </SnackbarProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}
