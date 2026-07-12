import { useEffect, useRef } from 'react';
import { AppState, Platform, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useShareIntent } from 'expo-share-intent';
import { runMigrations } from '@/db/client';
import { useTheme, useThemePreference, darkColors, lightColors, Typography } from '@/constants/theme';
import { ThemeProvider } from '@/constants/ThemeProvider';
import { LanguageProvider, useT } from '@/i18n/LanguageProvider';
import { SnackbarProvider, useSnackbar } from '@/components/ui/SnackbarProvider';
import { useBackupRunning } from '@/utils/backupStatus';
import { flushAutoBackup } from '@/utils/backupTrigger';
import { maybeBackupOnLaunch } from '@/utils/backupArchiveFs';
import { isShareIntentAvailable } from '@/utils/shareIntent';
import { toImportIntent } from '@/utils/sharedUrl';

function BackupBanner() {
  const running = useBackupRunning();
  const c = useTheme();
  const t = useT();
  const { bottom } = useSafeAreaInsets();
  if (!running) return null;
  return (
    <View style={[bannerStyles.banner, { backgroundColor: c.surface, borderColor: c.border, bottom: Math.max(bottom, 16) + 8 }]}>
      <ActivityIndicator size="small" color={c.primary} style={bannerStyles.spinner} />
      <Text style={[bannerStyles.label, { color: c.textSecondary }]}>{t('backup.saving')}</Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    // Elevation / shadow so it floats above content
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    zIndex: 999,
  },
  spinner: {
    marginRight: 8,
  },
  label: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
});

function SystemChrome() {
  const { scheme } = useThemePreference();

  useEffect(() => {
    // Match the Android system navigation bar to the app background; otherwise
    // it stays white in dark mode. No-op on iOS/web. Driven by the resolved
    // scheme so a manual Light/Dark override is honored too.
    if (Platform.OS !== 'android') return;
    const palette = scheme === 'dark' ? darkColors : lightColors;
    NavigationBar.setBackgroundColorAsync(palette.background);
    NavigationBar.setButtonStyleAsync(scheme === 'dark' ? 'light' : 'dark');
  }, [scheme]);

  // Explicit style (not "auto") so the status bar follows our override rather
  // than the OS appearance.
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

// Consumes Android share-target intents (SPEC §5.15) for text/URL shares and
// routes them to the new-recipe form pre-armed with the import. Rendered ONLY
// when the native module is linked (see isShareIntentAvailable) so it never
// mounts — and useShareIntent never runs — in Expo Go / web. Must sit inside
// SnackbarProvider so the "form busy" notice is reachable.
function ShareIntentHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const { showSnackbar } = useSnackbar();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  // Last-handled payload signature — prevents double-delivery on re-render or
  // foreground refresh from pushing the form twice for the same share. Cleared
  // once resetShareIntent() lands (hasShareIntent flips false), so it guards
  // only that window — re-sharing the same URL later must work again.
  const lastHandled = useRef<string | null>(null);

  useEffect(() => {
    if (!hasShareIntent) lastHandled.current = null;
  }, [hasShareIntent]);

  useEffect(() => {
    if (!hasShareIntent) return;
    // Android text/URL shares put the payload in webUrl (a shared link) or text
    // (plain shared text). Prefer the explicit URL, else the raw text.
    const raw = shareIntent.webUrl ?? shareIntent.text ?? null;
    const intent = toImportIntent(raw);
    // Consume immediately regardless of outcome so it isn't re-delivered.
    resetShareIntent();
    if (!intent) return;

    const signature = `${intent.mode}:${
      intent.mode === 'link' ? intent.url : intent.text
    }`;
    if (lastHandled.current === signature) return;
    lastHandled.current = signature;

    // A recipe form is already open — don't stack another modal or clobber the
    // in-progress edit. Notify and drop the share (SPEC §5.15).
    if (pathname === '/recipe/new' || pathname === '/recipe/edit') {
      showSnackbar({ message: t('share.formBusy') });
      return;
    }

    // Pass the raw text through; new.tsx re-derives the intent so arbitrary text
    // survives URL-encoding as a single param.
    router.push({
      pathname: '/recipe/new',
      params: {
        sharedText: intent.mode === 'link' ? intent.url : intent.text,
      },
    });
  }, [hasShareIntent, shareIntent, pathname, resetShareIntent, router, showSnackbar, t]);

  return null;
}

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
  useEffect(() => {
    // Run database migrations on app startup (creates app_settings, used by
    // LanguageProvider). Provider tolerates the table appearing late.
    try {
      runMigrations();
    } catch (e) {
      console.error('Database migration error:', e);
    }
    // Crash recovery: if the app was killed with changes not yet mirrored, the
    // in-memory dirty flag is gone — re-arm a backup by comparing data vs the
    // last export. Best-effort, runs after migrations created the tables.
    void maybeBackupOnLaunch();
  }, []);

  const appState = useRef(AppState.currentState);
  useEffect(() => {
    // Primary auto-backup path: flush the pending mirror when the app leaves the
    // foreground (SPEC.md §5.17.3). Packing now runs off the JS thread (native
    // RNZA), so this no longer freezes; flushing on background is kept by choice
    // (one clean backup per session, off-screen). Fire only on the active →
    // background edge: 'background' means a real leave (home / app switcher),
    // whereas iOS emits a transient 'inactive' for control
    // centre / notification-shade pulls while the app is still on top — flushing
    // there would freeze a visible app. Android goes straight active → background.
    const sub = AppState.addEventListener('change', (next) => {
      const wasActive = appState.current === 'active';
      appState.current = next;
      if (wasActive && next === 'background') {
        // Best-effort and self-guarding (no-op if nothing changed / already
        // running). The OS background grace window is enough for the write; a
        // hard kill mid-write is covered by write-then-prune keeping the prior
        // archive intact, and a crash before any flush is healed on the next
        // launch by maybeBackupOnLaunch. This is the ONLY trigger for the heavy
        // build — there is no foreground timer, so editing never freezes.
        void flushAutoBackup();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <LanguageProvider>
          <SnackbarProvider>
            <SystemChrome />
            <RootStack />
            <BackupBanner />
            {isShareIntentAvailable ? <ShareIntentHandler /> : null}
          </SnackbarProvider>
        </LanguageProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
