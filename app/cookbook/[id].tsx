import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { getCookbookById, deleteCookbook } from '@/db/cookbooks';
import {
  getRecipesByCookbook,
  getAllRecipes,
  deleteRecipe,
} from '@/db/recipes';
import { getSetting, setSetting } from '@/db/settings';
import { lightTap } from '@/utils/haptics';
import { deleteStoredImage } from '@/utils/imageStorage';
import { shareCookbookPdf } from '@/utils/cookbookPdf';
import {
  pendingDeleteKey,
  filterPendingDeletes,
  subscribePendingDeletes,
} from '@/utils/pendingDelete';
import { useUndoDelete } from '@/components/ui/SnackbarProvider';
import { partitionToTry, countToTry } from '@/utils/toTry';
import { matchRecipes } from '@/utils/search';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
  Motion,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import { pluralPl } from '@/utils/i18n';
import type { TranslationKey } from '@/i18n/dictionary';
import ScreenHeader from '@/components/ui/ScreenHeader';
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Fab from '@/components/ui/Fab';
import ActionSheet from '@/components/ui/ActionSheet';
import SwipeableRow from '@/components/ui/SwipeableRow';
import type { Recipe, Cookbook } from '@/db/schema';

const CARD_IMAGE_HEIGHT = 150;

// "1 serving" / "2 porcje" / "5 porcji" — the card is the one place a raw
// servings count is rendered inline, so it needs the same plural treatment as
// the shopping-list counters.
const servingsKeys: Record<ReturnType<typeof pluralPl>, TranslationKey> = {
  one: 'cookbook.servings.one',
  few: 'cookbook.servings.few',
  many: 'cookbook.servings.many',
};

// The recipe list can carry a single "To try" section header between the normal
// and to-try partitions (§5.19). A stable non-numeric key keeps it from ever
// colliding with a recipe id in keyExtractor.
const TO_TRY_HEADER_KEY = 'header:to-try';
type ListItem =
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'header' };

function RecipeCard({
  recipe,
  hint,
  onPress,
  onLongPress,
}: {
  recipe: Recipe;
  /** Matched ingredient line for an ingredient-only search hit (§5.3). */
  hint: string | null;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
  const hintText = hint ? t('cookbook.inIngredients', { line: hint }) : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={hintText ? `${recipe.title}, ${hintText}` : recipe.title}
    >
      {recipe.imagePath ? (
        <Image
          source={{ uri: recipe.imagePath }}
          style={styles.cardImage}
          contentFit="cover"
          transition={Motion.duration.base}
          accessibilityLabel={t('a11y.recipePhoto')}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="restaurant-outline" size={36} color={c.border} />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {recipe.title}
          </Text>
          {recipe.toTry ? (
            <Ionicons
              name="flask-outline"
              size={16}
              color={c.textMuted}
              style={styles.cardToTryIcon}
              accessibilityLabel={t('toTry.badge')}
            />
          ) : null}
        </View>
        {hintText ? (
          <Text style={styles.cardHint} numberOfLines={1}>
            {hintText}
          </Text>
        ) : null}
        {totalTime > 0 || recipe.servings ? (
          <View style={styles.cardMeta}>
            {totalTime > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={14} color={c.textMuted} />
                <Text style={styles.metaText}>
                  {t('cookbook.minutes', { count: totalTime })}
                </Text>
              </View>
            ) : null}
            {recipe.servings ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={14} color={c.textMuted} />
                <Text style={styles.metaText}>
                  {t(servingsKeys[pluralPl(recipe.servings)], {
                    count: recipe.servings,
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function SkeletonCard() {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={styles.card}>
      <View style={[styles.cardImage, { backgroundColor: c.surfaceAlt }]} />
      <View style={styles.cardBody}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
    </View>
  );
}

export default function CookbookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const isAll = id === 'all';

  const [cookbook, setCookbook] = useState<Cookbook | null>(null);
  // Everything this view can show, loaded once per focus; search and the
  // to-try chip filter it in memory (§5.3 — never per keystroke from the DB).
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [cookbookMenuOpen, setCookbookMenuOpen] = useState(false);
  const [recipeMenu, setRecipeMenu] = useState<Recipe | null>(null);
  const [peekRecipeId, setPeekRecipeId] = useState<number | null>(null);
  // §5.19 filter chip: session-only, "All recipes" view only.
  const [toTryOnly, setToTryOnly] = useState(false);
  const showUndoDelete = useUndoDelete();

  const loadData = useCallback(async () => {
    if (isAll) {
      const data = await getAllRecipes();
      setAllRecipes(filterPendingDeletes(data, 'recipe', (r) => r.id));
    } else {
      const cbId = Number(id);
      const [cb, data] = await Promise.all([
        getCookbookById(cbId),
        getRecipesByCookbook(cbId),
      ]);
      setCookbook(cb || null);
      setAllRecipes(filterPendingDeletes(data, 'recipe', (r) => r.id));
    }
    setIsLoaded(true);
  }, [id, isAll]);

  // Chip count is over the whole library, independent of the query.
  const toTryTotal = useMemo(
    () => (isAll ? countToTry(allRecipes) : 0),
    [isAll, allRecipes]
  );

  // Visible list: to-try chip filter, then the title + ingredient search (§5.3)
  // in the All view — title matches first, ingredient matches after, each
  // keeping the updated_at order. Ingredient-only hits carry a hint line.
  const { recipes, hints } = useMemo(() => {
    const base = toTryOnly ? allRecipes.filter((r) => r.toTry) : allRecipes;
    const matches = isAll
      ? matchRecipes(base, searchQuery)
      : base.map((recipe) => ({ recipe, ingredientHint: null }));
    const hintById = new Map<number, string>();
    for (const m of matches) {
      if (m.ingredientHint) hintById.set(m.recipe.id, m.ingredientHint);
    }
    return { recipes: matches.map((m) => m.recipe), hints: hintById };
  }, [allRecipes, isAll, searchQuery, toTryOnly]);

  const clearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => subscribePendingDeletes(loadData), [loadData]);

  // Confirmation first (deliberate speed bump for recipes and cookbooks),
  // then the delete still goes through the undo snackbar before committing.
  const handleDeleteRecipe = (recipe: Recipe) => {
    Alert.alert(t('confirm.deleteRecipe', { title: recipe.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          showUndoDelete(
            pendingDeleteKey('recipe', recipe.id),
            recipe.title,
            async () => {
              await deleteRecipe(recipe.id);
              await deleteStoredImage(recipe.imagePath ?? null);
            }
          ),
      },
    ]);
  };

  const handleDeleteCookbook = () => {
    if (!cookbook) return;
    Alert.alert(
      t('confirm.deleteCookbook', { name: cookbook.name }),
      t('confirm.deleteCookbookMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            showUndoDelete(
              pendingDeleteKey('cookbook', cookbook.id),
              cookbook.name,
              async () => {
                await deleteCookbook(cookbook.id);
                await deleteStoredImage(cookbook.coverImagePath);
              }
            );
            router.back();
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    if (!cookbook) return;
    try {
      await shareCookbookPdf(cookbook, t, t('cookbook.sharePdfTitle'));
    } catch (e) {
      Alert.alert(
        t('cookbook.exportFailedTitle'),
        t('cookbook.exportFailedMessage')
      );
    }
  };

  const handleAddRecipe = () =>
    router.push({
      pathname: '/recipe/new',
      params: isAll ? {} : { cookbookId: id },
    });

  const headerTitle = isAll ? t('home.allRecipes') : cookbook?.name ?? '';

  // Build the flat list: normal recipes, then the "To try" section header (only
  // when non-empty), then the to-try recipes. When the chip is active the list
  // is already to-try-only, so partitioning is a no-op — render it plain.
  const listItems: ListItem[] = useMemo(() => {
    if (toTryOnly) {
      return recipes.map((recipe) => ({ kind: 'recipe' as const, recipe }));
    }
    const { normal, toTry } = partitionToTry(recipes);
    const items: ListItem[] = normal.map((recipe) => ({
      kind: 'recipe' as const,
      recipe,
    }));
    if (toTry.length > 0) {
      items.push({ kind: 'header' });
      for (const recipe of toTry) items.push({ kind: 'recipe' as const, recipe });
    }
    return items;
  }, [recipes, toTryOnly]);

  // Swipe actions are otherwise invisible: on the very first visit that shows
  // any recipes, briefly reveal the first row's actions, then never again.
  // The hint is pinned to that recipe's id and cleared once it has played —
  // a plain "first row" flag would replay on every row that later mounts at
  // index 0 (e.g. each newly saved recipe).
  const firstRecipeId =
    listItems[0]?.kind === 'recipe' ? listItems[0].recipe.id : null;
  useEffect(() => {
    if (!isLoaded || firstRecipeId === null) return;
    let cancelled = false;
    (async () => {
      if (await getSetting('swipeHintSeen')) return;
      if (cancelled) return;
      setPeekRecipeId(firstRecipeId);
      await setSetting('swipeHintSeen', '1');
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, firstRecipeId]);

  return (
    <View style={styles.container}>
      <ScreenHeader title={headerTitle} back>
        {!isAll && cookbook ? (
          <IconButton
            icon="ellipsis-horizontal"
            accessibilityLabel={t('a11y.moreActions')}
            onPress={() => setCookbookMenuOpen(true)}
          />
        ) : null}
      </ScreenHeader>

      {/* Search bar — title + ingredient search across all cookbooks (SPEC
          §5.3), so it only appears in the "All recipes" view. Focused on
          entry; the "×" is our own so it works on Android too (iOS-only
          clearButtonMode is not relied on). */}
      {isAll ? (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={c.textMuted} />
          <Input
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={t('cookbook.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoFocus
            accessibilityLabel={t('cookbook.searchPlaceholder')}
          />
          {searchQuery ? (
            <IconButton
              icon="close-circle"
              size={18}
              color={c.textMuted}
              accessibilityLabel={t('a11y.clearSearch')}
              onPress={clearSearch}
            />
          ) : null}
        </View>
      ) : null}

      {/* To-try filter chip (§5.19) — All view only, hidden when nothing is
          marked. Session-only, AND-combined with the search query. */}
      {isAll && toTryTotal > 0 ? (
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setToTryOnly((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: toTryOnly }}
            style={[styles.chip, toTryOnly ? styles.chipActive : styles.chipInactive]}
          >
            <Ionicons
              name="flask-outline"
              size={14}
              color={toTryOnly ? c.onPrimary : c.text}
            />
            <Text
              style={[
                styles.chipText,
                { color: toTryOnly ? c.onPrimary : c.text },
              ]}
            >
              {t('cookbook.toTryChip', { count: toTryTotal })}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Recipe list */}
      {!isLoaded ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : recipes.length === 0 ? (
        searchQuery.trim() ? (
          <EmptyState icon="search-outline" text={t('cookbook.noResults')} />
        ) : (
          <EmptyState
            icon="restaurant-outline"
            text={t('cookbook.emptyRecipes')}
            actionLabel={t('cookbook.emptyAction')}
            onAction={handleAddRecipe}
          />
        )
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) =>
            item.kind === 'header' ? TO_TRY_HEADER_KEY : String(item.recipe.id)
          }
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <Text style={styles.sectionHeader} accessibilityRole="header">
                  {t('toTry.badge')}
                </Text>
              );
            }
            const recipe = item.recipe;
            return (
              <SwipeableRow
                onEdit={() =>
                  router.push({ pathname: '/recipe/edit', params: { id: recipe.id } })
                }
                onDelete={() => handleDeleteRecipe(recipe)}
                peek={recipe.id === peekRecipeId}
                onPeekEnd={() => setPeekRecipeId(null)}
              >
                <RecipeCard
                  recipe={recipe}
                  hint={hints.get(recipe.id) ?? null}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                  onLongPress={() => {
                    lightTap();
                    setRecipeMenu(recipe);
                  }}
                />
              </SwipeableRow>
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        />
      )}
      {isLoaded && recipes.length > 0 ? (
        <Fab
          accessibilityLabel={t('a11y.addRecipe')}
          onPress={handleAddRecipe}
        />
      ) : null}

      <ActionSheet
        visible={cookbookMenuOpen}
        title={cookbook?.name}
        onClose={() => setCookbookMenuOpen(false)}
        actions={[
          {
            label: t('cookbook.menuSharePdf'),
            icon: 'share-outline',
            onPress: handleExport,
          },
          {
            label: t('common.edit'),
            icon: 'create-outline',
            onPress: () => router.push(`/cookbook/edit?id=${id}`),
          },
          {
            label: t('common.delete'),
            icon: 'trash-outline',
            destructive: true,
            onPress: handleDeleteCookbook,
          },
        ]}
      />

      {/* Long-press menu — the always-available alternative to the swipe
          gesture for editing or deleting a recipe. */}
      <ActionSheet
        visible={recipeMenu !== null}
        title={recipeMenu?.title}
        onClose={() => setRecipeMenu(null)}
        actions={
          recipeMenu
            ? [
                {
                  label: t('common.edit'),
                  icon: 'create-outline',
                  onPress: () =>
                    router.push({
                      pathname: '/recipe/edit',
                      params: { id: recipeMenu.id },
                    }),
                },
                {
                  label: t('common.delete'),
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => handleDeleteRecipe(recipeMenu),
                },
              ]
            : []
        }
      />
    </View>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.md,
    backgroundColor: c.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  list: {
    paddingHorizontal: Spacing.base,
    // Clears the floating action button.
    paddingBottom: Spacing.xxxl * 2,
    gap: Spacing.base,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  // Opaque pressed state — the card sits over the swipe-action panel, so it
  // must never go translucent or shrink (the panel would show through).
  cardPressed: {
    backgroundColor: c.surfaceAlt,
  },
  cardImage: {
    width: '100%',
    height: CARD_IMAGE_HEIGHT,
  },
  cardImagePlaceholder: {
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: Spacing.base,
    gap: Spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  cardTitle: {
    flex: 1,
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: c.text,
    lineHeight: Typography.size.md * 1.3,
  },
  cardToTryIcon: {
    marginTop: 2,
  },
  cardHint: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
  },
  sectionHeader: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: c.primary,
    borderColor: c.primary,
  },
  chipInactive: {
    backgroundColor: c.surface,
    borderColor: c.border,
  },
  chipText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
  },
  skeletonLine: {
    height: 14,
    borderRadius: Radius.sm,
    backgroundColor: c.surfaceAlt,
    width: '70%',
  },
  skeletonLineShort: {
    width: '40%',
  },
});
