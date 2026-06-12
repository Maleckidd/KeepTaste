import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { getCookbookById, deleteCookbook } from '@/db/cookbooks';
import {
  getRecipesByCookbook,
  getAllRecipes,
  searchRecipes,
  deleteRecipe,
} from '@/db/recipes';
import { deleteStoredImage } from '@/utils/imageStorage';
import { shareCookbookPdf } from '@/utils/cookbookPdf';
import {
  pendingDeleteKey,
  filterPendingDeletes,
  subscribePendingDeletes,
} from '@/utils/pendingDelete';
import { useUndoDelete } from '@/components/ui/SnackbarProvider';
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
import ScreenHeader from '@/components/ui/ScreenHeader';
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Fab from '@/components/ui/Fab';
import ActionSheet from '@/components/ui/ActionSheet';
import SwipeableRow from '@/components/ui/SwipeableRow';
import type { Recipe, Cookbook } from '@/db/schema';

const CARD_IMAGE_HEIGHT = 150;

function RecipeCard({
  recipe,
  onPress,
}: {
  recipe: Recipe;
  onPress: () => void;
}) {
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipe.title}
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
        <Text style={styles.cardTitle} numberOfLines={2}>
          {recipe.title}
        </Text>
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
                  {t('cookbook.servings', { count: recipe.servings })}
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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [cookbookMenuOpen, setCookbookMenuOpen] = useState(false);
  const showUndoDelete = useUndoDelete();

  const loadData = useCallback(async () => {
    if (isAll) {
      const data = searchQuery
        ? await searchRecipes(searchQuery)
        : await getAllRecipes();
      setRecipes(filterPendingDeletes(data, 'recipe', (r) => r.id));
    } else {
      const cbId = Number(id);
      const [cb, data] = await Promise.all([
        getCookbookById(cbId),
        getRecipesByCookbook(cbId),
      ]);
      setCookbook(cb || null);
      setRecipes(filterPendingDeletes(data, 'recipe', (r) => r.id));
    }
    setIsLoaded(true);
  }, [id, isAll, searchQuery]);

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

  return (
    <View style={styles.container}>
      <ScreenHeader title={headerTitle} back>
        {!isAll && cookbook ? (
          <>
            <IconButton
              icon="share-outline"
              accessibilityLabel={t('a11y.shareCookbook')}
              onPress={handleExport}
            />
            <IconButton
              icon="ellipsis-horizontal"
              accessibilityLabel={t('a11y.moreActions')}
              onPress={() => setCookbookMenuOpen(true)}
            />
          </>
        ) : null}
      </ScreenHeader>

      {/* Search bar — title search works across all cookbooks (SPEC §5.3),
          so it only appears in the "All recipes" view */}
      {isAll ? (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={c.textMuted} />
          <Input
            style={styles.searchInput}
            placeholder={t('cookbook.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel={t('cookbook.searchPlaceholder')}
          />
        </View>
      ) : null}

      {/* Recipe list */}
      {!isLoaded ? (
        <View style={styles.list}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : recipes.length === 0 ? (
        searchQuery ? (
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
          data={recipes}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <SwipeableRow
              onEdit={() =>
                router.push({ pathname: '/recipe/edit', params: { id: item.id } })
              }
              onDelete={() => handleDeleteRecipe(item)}
            >
              <RecipeCard
                recipe={item}
                onPress={() => router.push(`/recipe/${item.id}`)}
              />
            </SwipeableRow>
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
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
    ...Shadow.md,
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
  cardTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: c.text,
    lineHeight: Typography.size.md * 1.3,
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
