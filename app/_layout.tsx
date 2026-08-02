import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Animated, AppState, Image, Platform, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useShareIntent } from 'expo-share-intent';
import { runMigrations } from '@/db/client';
import { useTheme, useThemePreference, darkColors, lightColors, Typography, Motion } from '@/constants/theme';
import { ThemeProvider } from '@/constants/ThemeProvider';
import { LanguageProvider, useLanguageReady, useT } from '@/i18n/LanguageProvider';
import { SnackbarProvider, useSnackbar } from '@/components/ui/SnackbarProvider';
import { useBackupRunning } from '@/utils/backupStatus';
import { flushAutoBackup } from '@/utils/backupTrigger';
import { maybeBackupOnLaunch } from '@/utils/backupArchiveFs';
import { isShareIntentAvailable } from '@/utils/shareIntent';
import { toImportIntent } from '@/utils/sharedUrl';
import { isAppReady, subscribeAppReady } from '@/utils/appReady';
import { prefersReducedMotion } from '@/utils/motion';

// Keep the native splash up until the persisted theme preference has loaded
// and a themed overlay frame is ready — otherwise the first React frames
// render on the default white window (and in the default light theme), which
// shows as a white flash between the splash and the app. Hidden by SplashGate
// the moment the JS overlay can take over. No-op on web.
if (Platform.OS !== 'web') {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

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
    // Match the native window background to the app theme — this is the color
    // that shows through any gap frame (e.g. right after the splash hides),
    // which otherwise defaults to white. No-op on web.
    if (Platform.OS !== 'web') {
      const palette = scheme === 'dark' ? darkColors : lightColors;
      void SystemUI.setBackgroundColorAsync(palette.background).catch(() => {});
    }
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

// Minimum time the JS splash overlay stays visible after JS starts. Readiness
// alone can resolve in a few frames on fast devices, which makes the logo
// flash instead of reading as a launch moment. Applies to the overlay ONLY —
// the native splash must hand off as early as possible (see SplashGate),
// because its colors are baked at build time and may not match the app theme
// (e.g. manual dark theme on a light-mode system). The 5s failsafe still caps
// the total, so a slow load is never made slower — this only lifts the floor.
const MIN_SPLASH_VISIBLE_MS = 1200;

// Width/height of the overlay logo box, in dp. MUST stay in sync with
// `imageWidth` in the expo-splash-screen plugin config (app.json) — both scale
// the same square source image, so equal values put the logo at exactly the
// same size in the native splash and in this overlay. A mismatch makes the
// logo visibly jump the moment the overlay takes over. Changing it requires a
// native rebuild to regenerate the Android splash drawables.
const SPLASH_LOGO_SIZE = 160;

// True once the minimum splash time has passed (counted from first JS mount).
function useMinSplashElapsed(): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), MIN_SPLASH_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return elapsed;
}

// Hides the native splash as soon as the JS overlay can take over: the theme
// preference has resolved and a frame with the correctly-themed overlay has
// painted. The native splash draws ABOVE the app window, its colors are baked
// at build time, and Android 12+ fades its icon out on its own — so every
// extra millisecond it is held shows a possibly wrong-colored, logo-less
// screen. All further waiting (first data load, minimum logo time) belongs to
// the SplashOverlay below, which renders in the real app theme. A failsafe
// timeout hides the splash after 5s regardless, so a hung preference read can
// never trap the user on the splash screen.
function SplashGate() {
  const { ready: themeReady } = useThemePreference();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!themeReady) return;
    // Wait one frame so the hide lands after the themed overlay has painted.
    const frame = requestAnimationFrame(() => {
      void SplashScreen.hideAsync().catch(() => {});
    });
    return () => cancelAnimationFrame(frame);
  }, [themeReady]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const failsafe = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 5000);
    return () => clearTimeout(failsafe);
  }, []);

  return null;
}

// In-app splash: a theme-aware, full-screen logo overlay pinned above the UI
// from the very first JS frame until the app is fully loaded (theme + language
// + first screen data) and MIN_SPLASH_VISIBLE_MS has passed, then faded out.
// It takes over from the native splash (which SplashGate releases as soon as
// the theme is known) and carries the logo through territory the native one
// can't: Android 12+ fades the native icon out on its own, the native colors
// can't follow a manual theme override, and the dev-client bundle gap has no
// native coverage at all. Has its own 5s failsafe.
function SplashOverlay() {
  const { scheme, ready: themeReady } = useThemePreference();
  const languageReady = useLanguageReady();
  const appReady = useSyncExternalStore(subscribeAppReady, isAppReady, isAppReady);
  const minElapsed = useMinSplashElapsed();
  const [gone, setGone] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const failsafe = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(failsafe);
  }, []);

  const dismiss = (themeReady && languageReady && appReady && minElapsed) || timedOut;

  useEffect(() => {
    if (!dismiss || gone) return;
    if (prefersReducedMotion()) {
      setGone(true);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: 0,
      duration: Motion.duration.base,
      useNativeDriver: Platform.OS !== 'web',
    });
    anim.start(() => setGone(true));
    return () => anim.stop();
  }, [dismiss, gone, opacity]);

  if (gone) return null;

  const palette = scheme === 'dark' ? darkColors : lightColors;
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        overlayStyles.container,
        { backgroundColor: palette.background, opacity },
      ]}
    >
      <Image
        source={require('@/assets/images/splash-icon.png')}
        style={overlayStyles.logo}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const overlayStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    // Above every screen and the backup banner (zIndex 999).
    zIndex: 1000,
    elevation: 1000,
  },
  logo: {
    width: SPLASH_LOGO_SIZE,
    height: SPLASH_LOGO_SIZE,
  },
});

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
    <ThemeProvider>
      <ThemedRoot>
        <LanguageProvider>
          <SnackbarProvider>
            <SystemChrome />
            <SplashGate />
            <RootStack />
            <BackupBanner />
            <SplashOverlay />
            {isShareIntentAvailable ? <ShareIntentHandler /> : null}
          </SnackbarProvider>
        </LanguageProvider>
      </ThemedRoot>
    </ThemeProvider>
  );
}

// Root view carries the theme background itself so no frame between the
// splash and the first screen can show the default white window.
function ThemedRoot({ children }: { children: ReactNode }) {
  const c = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      {children}
    </GestureHandlerRootView>
  );
}
