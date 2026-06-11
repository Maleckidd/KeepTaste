import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCookbookById } from '@/db/cookbooks';
import { getRecipesByCookbook, getAllRecipes, searchRecipes } from '@/db/recipes';
import { exportCookbookToMarkdown } from '@/utils/markdown';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import type { Recipe, Cookbook } from '@/db/schema';

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
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {recipe.imagePath ? (
        <Image
          source={{ uri: recipe.imagePath }}
          style={styles.cardImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Ionicons name="restaurant-outline" size={28} color={c.border} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.cardMeta}>
          {recipe.prepTime || recipe.cookTime ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={c.textMuted} />
              <Text style={styles.metaText}>
                {t('cookbook.minutes', {
                  count: (recipe.prepTime || 0) + (recipe.cookTime || 0),
                })}
              </Text>
            </View>
          ) : null}
          {recipe.servings ? (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={13} color={c.textMuted} />
              <Text style={styles.metaText}>
                {t('cookbook.servings', { count: recipe.servings })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={c.border} />
    </TouchableOpacity>
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

  const loadData = useCallback(async () => {
    if (isAll) {
      const data = searchQuery
        ? await searchRecipes(searchQuery)
        : await getAllRecipes();
      setRecipes(data);
    } else {
      const cbId = Number(id);
      const [cb, data] = await Promise.all([
        getCookbookById(cbId),
        getRecipesByCookbook(cbId),
      ]);
      setCookbook(cb || null);
      setRecipes(data);
    }
  }, [id, isAll, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleExport = async () => {
    if (!cookbook) return;
    try {
      await exportCookbookToMarkdown(cookbook);
    } catch (e) {
      Alert.alert(
        t('cookbook.exportFailedTitle'),
        t('cookbook.exportFailedMessage')
      );
    }
  };

  const headerTitle = isAll ? t('home.allRecipes') : cookbook?.name ?? '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.headerActions}>
          {!isAll && cookbook && (
            <TouchableOpacity onPress={handleExport} style={styles.iconButton}>
              <Ionicons name="share-outline" size={22} color={c.text} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/recipe/new',
                params: isAll ? {} : { cookbookId: id },
              })
            }
            style={styles.iconButton}
          >
            <Ionicons name="add" size={26} color={c.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar — title search works across all cookbooks (SPEC §5.3),
          so it only appears in the "All recipes" view */}
      {isAll ? (
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={c.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('cookbook.searchPlaceholder')}
            placeholderTextColor={c.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      {/* Recipe list */}
      {recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={48} color={c.border} />
          <Text style={styles.emptyText}>
            {searchQuery
              ? t('cookbook.noResults')
              : t('cookbook.emptyRecipes')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <RecipeCard
              recipe={item}
              onPress={() => router.push(`/recipe/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backButton: {
    padding: Spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  iconButton: {
    padding: Spacing.xs,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: c.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: c.border,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.size.base,
    color: c.text,
    paddingVertical: 0,
  },
  list: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    gap: Spacing.md,
    paddingRight: Spacing.md,
    ...Shadow.sm,
  },
  cardImage: {
    width: 80,
    height: 80,
  },
  cardImagePlaceholder: {
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  cardTitle: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
    lineHeight: Typography.size.base * 1.3,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: Typography.size.xs,
    color: c.textMuted,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxxl,
  },
  emptyText: {
    fontSize: Typography.size.base,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.5,
  },
});
