import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCookbooks, deleteCookbook } from '@/db/cookbooks';
import { deleteStoredImage } from '@/utils/imageStorage';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';
import type { Cookbook } from '@/db/schema';

function CookbookTile({
  item,
  index,
  onPress,
  onLongPress,
}: {
  item: Cookbook;
  index: number;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const tileColors = c.cookbookColors;
  const tileColor = tileColors[index % tileColors.length];

  return (
    <TouchableOpacity
      style={[styles.tile, { backgroundColor: tileColor }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
    >
      {item.coverImagePath ? (
        <Image
          source={{ uri: item.coverImagePath }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.tileOverlay}>
        <View style={styles.tileIcon}>
          <Ionicons name="book-outline" size={22} color="rgba(255,255,255,0.8)" />
        </View>
        <Text style={styles.tileName} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);

  const loadCookbooks = useCallback(async () => {
    const data = await getCookbooks();
    setCookbooks(data);
  }, []);

  // Reload when the screen regains focus
  useFocusEffect(
    useCallback(() => {
      loadCookbooks();
    }, [loadCookbooks])
  );

  const handleAddCookbook = () => {
    router.push('/cookbook/new');
  };

  const handleOpenAllRecipes = () => {
    router.push('/cookbook/all');
  };

  const handleDeleteCookbook = (cookbook: Cookbook) => {
    Alert.alert(
      `Delete "${cookbook.name}"?`,
      "Recipes from this cookbook won't be deleted — you'll find them in 'All recipes'.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteCookbook(cookbook.id);
            await deleteStoredImage(cookbook.coverImagePath);
            loadCookbooks();
          },
        },
      ]
    );
  };

  const handleCookbookLongPress = (cookbook: Cookbook) => {
    Alert.alert(
      cookbook.name,
      'What would you like to do?',
      [
        {
          text: 'Edit',
          onPress: () => router.push(`/cookbook/edit?id=${cookbook.id}`),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteCookbook(cookbook),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: Cookbook; index: number }) => (
    <CookbookTile
      item={item}
      index={index}
      onPress={() => router.push(`/cookbook/${item.id}`)}
      onLongPress={() => handleCookbookLongPress(item)}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>KeepTaste</Text>
          <Text style={styles.headerTitle}>Cookbooks</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={22} color={c.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleAddCookbook}>
            <Ionicons name="add" size={26} color={c.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* "All recipes" tile */}
      <TouchableOpacity style={styles.allRecipesTile} onPress={handleOpenAllRecipes}>
        <Ionicons name="search-outline" size={18} color={c.textSecondary} />
        <Text style={styles.allRecipesText}>All recipes</Text>
        <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
      </TouchableOpacity>

      {/* Cookbook grid */}
      {cookbooks.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={56} color={c.border} />
          <Text style={styles.emptyTitle}>No cookbooks</Text>
          <Text style={styles.emptyText}>
            Tap + to create your first cookbook
          </Text>
        </View>
      ) : (
        <FlatList
          data={cookbooks}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const TILE_SIZE = 160;

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.base,
  },
  headerSub: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  allRecipesTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  allRecipesText: {
    flex: 1,
    fontSize: Typography.size.base,
    color: c.textSecondary,
  },
  grid: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  row: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.md,
  },
  tileOverlay: {
    flex: 1,
    padding: Spacing.base,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  tileIcon: {
    alignSelf: 'flex-start',
  },
  tileName: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: c.textSecondary,
  },
  emptyText: {
    fontSize: Typography.size.base,
    color: c.textMuted,
    textAlign: 'center',
    lineHeight: Typography.size.base * 1.5,
  },
});
