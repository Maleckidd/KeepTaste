import React, { useState, useCallback } from 'react';
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
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';
import type { Recipe, Cookbook } from '@/db/schema';

function RecipeCard({
  recipe,
  onPress,
}: {
  recipe: Recipe;
  onPress: () => void;
}) {
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
          <Ionicons name="restaurant-outline" size={28} color={Colors.border} />
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {recipe.title}
        </Text>
        <View style={styles.cardMeta}>
          {recipe.prepTime || recipe.cookTime ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.metaText}>
                {(recipe.prepTime || 0) + (recipe.cookTime || 0)} min
              </Text>
            </View>
          ) : null}
          {recipe.servings ? (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={13} color={Colors.textMuted} />
              <Text style={styles.metaText}>{recipe.servings} servings</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.border} />
    </TouchableOpacity>
  );
}

export default function CookbookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
      Alert.alert('Export failed', 'Could not export the cookbook.');
    }
  };

  const headerTitle = isAll ? 'All recipes' : cookbook?.name ?? '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.headerActions}>
          {!isAll && cookbook && (
            <TouchableOpacity onPress={handleExport} style={styles.iconButton}>
              <Ionicons name="share-outline" size={22} color={Colors.text} />
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
            <Ionicons name="add" size={26} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipes..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Recipe list */}
      {recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'No results'
              : 'No recipes. Tap + to add your first one.'}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.text,
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
    backgroundColor: Colors.surface,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.size.base,
    color: Colors.text,
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
    backgroundColor: Colors.surface,
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
    backgroundColor: Colors.surfaceAlt,
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
    color: Colors.text,
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
    color: Colors.textMuted,
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
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.5,
  },
});
