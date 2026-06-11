import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { getRecipeById, deleteRecipe } from '@/db/recipes';
import { deleteStoredImage } from '@/utils/imageStorage';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import type { Translator } from '@/utils/i18n';
import type { Recipe } from '@/db/schema';

function formatTime(
  t: Translator,
  minutes: number | null | undefined
): string {
  if (!minutes) return '';
  if (minutes < 60) return t('recipe.minutesShort', { count: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0
    ? t('recipe.hoursMinutes', { hours: h, minutes: m })
    : t('recipe.hours', { hours: h });
}

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const markdownStyles = useMemo(() => makeMarkdownStyles(c), [c]);

  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const loadData = useCallback(async () => {
    const r = await getRecipeById(Number(id));
    setRecipe(r || null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDelete = () => {
    Alert.alert(
      t('recipe.deleteTitle'),
      t('recipe.deleteMessage', { title: recipe?.title ?? '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteRecipe(Number(id));
            await deleteStoredImage(recipe?.imagePath ?? null);
            router.back();
          },
        },
      ]
    );
  };

  if (!recipe) return null;

  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <View style={styles.container}>
      {/* Nav bar with actions */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: '/recipe/edit', params: { id } })
            }
            style={styles.navButton}
          >
            <Ionicons name="create-outline" size={22} color={c.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.navButton}>
            <Ionicons name="trash-outline" size={22} color={c.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Photo or placeholder */}
        {recipe.imagePath ? (
          <Image
            source={{ uri: recipe.imagePath }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="restaurant" size={48} color={c.border} />
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{recipe.title}</Text>

          {/* Metadata */}
          <View style={styles.metaRow}>
            {recipe.prepTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="cut-outline" size={15} color={c.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.prep')}</Text>
                  <Text style={styles.metaValue}>{formatTime(t, recipe.prepTime)}</Text>
                </View>
              </View>
            ) : null}
            {recipe.cookTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="flame-outline" size={15} color={c.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.cook')}</Text>
                  <Text style={styles.metaValue}>{formatTime(t, recipe.cookTime)}</Text>
                </View>
              </View>
            ) : null}
            {totalTime > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={15} color={c.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.total')}</Text>
                  <Text style={styles.metaValue}>{formatTime(t, totalTime)}</Text>
                </View>
              </View>
            ) : null}
            {recipe.servings ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={15} color={c.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>{t('recipe.servingsLabel')}</Text>
                  <Text style={styles.metaValue}>{recipe.servings}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Ingredients */}
          {recipe.ingredients ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('recipe.ingredients')}</Text>
              <Markdown style={markdownStyles}>{recipe.ingredients}</Markdown>
            </View>
          ) : null}

          {/* Instructions */}
          {recipe.instructions ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('recipe.instructions')}</Text>
              <Markdown style={markdownStyles}>{recipe.instructions}</Markdown>
            </View>
          ) : null}

          {/* Notes */}
          {recipe.notes ? (
            <View style={styles.notesBox}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text-outline" size={15} color={c.primary} />
                <Text style={styles.notesTitle}>{t('recipe.notes')}</Text>
              </View>
              <Text style={styles.notesText}>{recipe.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const makeMarkdownStyles = (c: ThemePalette) => ({
  body: {
    color: c.text,
    fontSize: Typography.size.base,
    lineHeight: Typography.size.base * 1.7,
  },
  heading1: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  heading2: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: c.text,
    marginTop: Spacing.base,
    marginBottom: Spacing.xs,
  },
  strong: {
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  bullet_list: {
    marginVertical: Spacing.xs,
  },
  list_item: {
    marginVertical: 2,
  },
});

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  heroPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.base,
  },
  title: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    letterSpacing: -0.5,
    lineHeight: Typography.size.xxl * 1.2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.base,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaLabel: {
    fontSize: Typography.size.xs,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesBox: {
    backgroundColor: c.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.base,
    borderLeftWidth: 3,
    borderLeftColor: c.primary,
    gap: Spacing.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  notesTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: Typography.size.base,
    color: c.text,
    lineHeight: Typography.size.base * 1.5,
  },
});
