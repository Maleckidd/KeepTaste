import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCookbooks, deleteCookbook } from '@/db/cookbooks';
import { deleteStoredImage } from '@/utils/imageStorage';
import {
  pendingDeleteKey,
  filterPendingDeletes,
  subscribePendingDeletes,
} from '@/utils/pendingDelete';
import { useUndoDelete } from '@/components/ui/SnackbarProvider';
import { lightTap } from '@/utils/haptics';
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
import IconButton from '@/components/ui/IconButton';
import EmptyState from '@/components/ui/EmptyState';
import Fab from '@/components/ui/Fab';
import ActionSheet from '@/components/ui/ActionSheet';
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
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: tileColor },
        pressed && styles.tilePressed,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      {item.coverImagePath ? (
        <Image
          source={{ uri: item.coverImagePath }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={Motion.duration.base}
        />
      ) : null}
      {/* Scrim keeps the white name readable on any cover photo */}
      <LinearGradient
        colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.55)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tileOverlay}>
        <Ionicons name="book-outline" size={22} color="rgba(255,255,255,0.85)" />
        <Text style={styles.tileName} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [menuCookbook, setMenuCookbook] = useState<Cookbook | null>(null);
  const showUndoDelete = useUndoDelete();

  const loadCookbooks = useCallback(async () => {
    const data = await getCookbooks();
    setCookbooks(filterPendingDeletes(data, 'cookbook', (cb) => cb.id));
  }, []);

  // Reload when the screen regains focus
  useFocusEffect(
    useCallback(() => {
      loadCookbooks();
    }, [loadCookbooks])
  );

  // Re-render when a pending delete is scheduled, undone or committed.
  useEffect(
    () => subscribePendingDeletes(loadCookbooks),
    [loadCookbooks]
  );

  const handleAddCookbook = () => {
    router.push('/cookbook/new');
  };

  const handleOpenAllRecipes = () => {
    router.push('/cookbook/all');
  };

  // Confirmation first (deliberate speed bump for cookbooks), then the
  // delete still goes through the undo snackbar before committing.
  // Recipes are not touched until commit (and survive it under "All recipes").
  const handleDeleteCookbook = (cookbook: Cookbook) => {
    Alert.alert(
      t('confirm.deleteCookbook', { name: cookbook.name }),
      t('confirm.deleteCookbookMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            showUndoDelete(
              pendingDeleteKey('cookbook', cookbook.id),
              cookbook.name,
              async () => {
                await deleteCookbook(cookbook.id);
                await deleteStoredImage(cookbook.coverImagePath);
              }
            ),
        },
      ]
    );
  };

  const handleCookbookLongPress = (cookbook: Cookbook) => {
    lightTap();
    setMenuCookbook(cookbook);
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {t('home.title')}
        </Text>
        <IconButton
          icon="settings-outline"
          accessibilityLabel={t('a11y.settings')}
          color={c.primary}
          raised
          onPress={() => router.push('/settings')}
        />
      </View>

      {/* "All recipes" tile */}
      <Pressable
        style={({ pressed }) => [
          styles.allRecipesTile,
          pressed && { backgroundColor: c.surfaceAlt },
        ]}
        onPress={handleOpenAllRecipes}
        accessibilityRole="button"
        accessibilityLabel={t('home.allRecipes')}
      >
        <Ionicons name="search-outline" size={18} color={c.textSecondary} />
        <Text style={styles.allRecipesText}>{t('home.allRecipes')}</Text>
        <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
      </Pressable>

      {/* Cookbook grid */}
      {cookbooks.length === 0 ? (
        <EmptyState
          icon="book-outline"
          title={t('home.emptyTitle')}
          text={t('home.emptyText')}
          actionLabel={t('home.emptyAction')}
          onAction={handleAddCookbook}
        />
      ) : (
        <>
          <FlatList
            data={cookbooks}
            renderItem={renderItem}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
          />
          {/* Tab bar already sits below — no extra bottom inset needed */}
          <Fab
            accessibilityLabel={t('a11y.addCookbook')}
            onPress={handleAddCookbook}
            withBottomInset={false}
          />
        </>
      )}

      <ActionSheet
        visible={menuCookbook !== null}
        title={menuCookbook?.name}
        onClose={() => setMenuCookbook(null)}
        actions={
          menuCookbook
            ? [
                {
                  label: t('common.edit'),
                  icon: 'create-outline',
                  onPress: () =>
                    router.push(`/cookbook/edit?id=${menuCookbook.id}`),
                },
                {
                  label: t('common.delete'),
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => handleDeleteCookbook(menuCookbook),
                },
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}

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
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },
  headerTitle: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    letterSpacing: -0.5,
  },
  allRecipesTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 48,
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
    // Clears the floating action button.
    paddingBottom: Spacing.xxxl * 2,
  },
  row: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  tile: {
    flex: 1,
    // Keeps a lone tile in the last row at half width instead of stretching.
    maxWidth: '48.4%',
    aspectRatio: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    ...Shadow.md,
  },
  tilePressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  tileOverlay: {
    flex: 1,
    padding: Spacing.base,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tileName: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
});
