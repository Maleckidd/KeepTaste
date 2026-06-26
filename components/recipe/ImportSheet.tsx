import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  BackHandler,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
  Touch,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import type { RecipeFormData } from '@/utils/recipeForm';
import {
  parseRecipeJsonLd,
  parsePastedRecipe,
  type ParsedRecipe,
} from '@/utils/recipeImport';
import { fetchRecipeFromUrl } from '@/utils/recipeImportFetch';

type Props = {
  visible: boolean;
  onClose: () => void;
  onResult: (partial: Partial<RecipeFormData>) => void;
};

type Mode = 'link' | 'paste';

const numToField = (n: number | null | undefined): string =>
  n != null ? String(n) : '';

// Single-recipe import sheet (SPEC.md §5.15). Mirrors FormattingHelpSheet's
// overlay pattern (no native <Modal>) so it stacks reliably and must be a
// direct child of the screen root.
export default function ImportSheet({ visible, onClose, onResult }: Props) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = makeStyles(c);

  const [rendered, setRendered] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(420);
  const progress = useRef(new Animated.Value(0)).current;

  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The sheet is anchored to the bottom, so the keyboard would otherwise cover
  // it. Track the keyboard height and lift the sheet above it.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (visible) {
      // Reset transient state each time the sheet opens.
      setMode('link');
      setUrl('');
      setPasteText('');
      setLoading(false);
      setError(null);
      setKeyboardHeight(0);
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
    const timer = setTimeout(() => setRendered(false), Motion.duration.fast + 50);
    return () => clearTimeout(timer);
  }, [visible, progress]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  if (!rendered) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHeight, 0],
  });

  // Keep the whole sheet (incl. its action button) within the space left above
  // the keyboard, so the confirm button is never hidden behind it. The paste
  // field absorbs the squeeze and scrolls internally rather than pushing the
  // button off-screen.
  const maxSheetHeight =
    windowHeight - insets.top - keyboardHeight - Spacing.xl;
  // Height taken by everything in the sheet other than the paste field
  // (grabber, title, mode tabs, button, gaps, paddings).
  const sheetChromeHeight = 250 + insets.bottom;
  const pasteInputMaxHeight = Math.max(100, maxSheetHeight - sheetChromeHeight);

  const buildFromParsed = (
    parsed: ParsedRecipe,
    sourceUrl?: string
  ): Partial<RecipeFormData> => {
    const partial: Partial<RecipeFormData> = {
      title: parsed.title ?? '',
      prepTime: numToField(parsed.prepTime),
      cookTime: numToField(parsed.cookTime),
      servings: numToField(parsed.servings),
      ingredients: parsed.ingredients ?? '',
      instructions: parsed.instructions ?? '',
    };
    if (sourceUrl) {
      partial.notes = t('import.sourcePrefix', { url: sourceUrl });
    }
    return partial;
  };

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRecipeFromUrl(trimmed);
      if (!res.ok) {
        if (res.reason === 'blocked') {
          // Server refused (WAF/paywall) — on-device fetch can't get past it;
          // guide the user to paste instead.
          setError(t('import.blocked'));
          setMode('paste');
        } else {
          setError(t('import.networkError'));
        }
        return;
      }
      const parsed = parseRecipeJsonLd(res.html);
      if (!parsed) {
        // Reached the page but it has no structured data — paste instead.
        setError(t('import.noStructuredData'));
        setMode('paste');
        return;
      }
      onResult(buildFromParsed(parsed, trimmed));
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = () => {
    const parsed = parsePastedRecipe(pasteText);
    onResult({
      title: parsed.title ?? '',
      prepTime: numToField(parsed.prepTime),
      cookTime: numToField(parsed.cookTime),
      servings: numToField(parsed.servings),
      ingredients: parsed.ingredients,
      instructions: parsed.instructions,
      notes: parsed.notes,
    });
    onClose();
  };

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
            paddingBottom: insets.bottom + Spacing.base,
            marginBottom: keyboardHeight,
            maxHeight: maxSheetHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('import.title')}</Text>

        <View style={styles.modeRow}>
          <ModeTab
            label={t('import.modeLink')}
            icon="link-outline"
            active={mode === 'link'}
            onPress={() => {
              setMode('link');
              setError(null);
            }}
            styles={styles}
            c={c}
          />
          <ModeTab
            label={t('import.modePaste')}
            icon="clipboard-outline"
            active={mode === 'paste'}
            onPress={() => {
              setMode('paste');
              setError(null);
            }}
            styles={styles}
            c={c}
          />
        </View>

        {mode === 'link' ? (
          <View style={styles.body}>
            <Input
              placeholder={t('import.urlPlaceholder')}
              value={url}
              onChangeText={(v) => {
                if (error) setError(null);
                setUrl(v);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={t('import.fetchButton')}
              onPress={handleFetch}
              loading={loading}
              disabled={!url.trim()}
            />
          </View>
        ) : (
          <View style={styles.body}>
            <Input
              style={[styles.pasteInput, { maxHeight: pasteInputMaxHeight }]}
              placeholder={t('import.pastePlaceholder')}
              value={pasteText}
              onChangeText={setPasteText}
              multiline
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              label={t('import.fetchButton')}
              onPress={handlePaste}
              disabled={!pasteText.trim()}
            />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

function ModeTab({
  label,
  icon,
  active,
  onPress,
  styles,
  c,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
  c: ThemePalette;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.modeTab,
        active && styles.modeTabActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={active ? c.primary : c.textMuted}
      />
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.base,
    ...Shadow.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: c.border,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text,
    marginBottom: Spacing.base,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: Touch.min,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  modeTabActive: {
    borderColor: c.primary,
    backgroundColor: c.surface,
  },
  modeLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.textMuted,
  },
  modeLabelActive: {
    color: c.primary,
  },
  body: {
    gap: Spacing.md,
  },
  pasteInput: {
    minHeight: 160,
  },
  error: {
    fontSize: Typography.size.sm,
    color: c.error,
    lineHeight: Typography.size.sm * 1.4,
  },
});
