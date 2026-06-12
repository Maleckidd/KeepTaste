import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getShoppingLists,
  deleteShoppingList,
  type ShoppingListWithCounts,
} from '@/db/shoppingLists';
import { progressCounts } from '@/utils/shoppingList';
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
  Touch,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import EmptyState from '@/components/ui/EmptyState';
import Fab from '@/components/ui/Fab';
import ActionSheet from '@/components/ui/ActionSheet';
import SwipeableRow from '@/components/ui/SwipeableRow';

export default function ShoppingScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [lists, setLists] = useState<ShoppingListWithCounts[]>([]);
  const [menuList, setMenuList] = useState<ShoppingListWithCounts | null>(null);
  const showUndoDelete = useUndoDelete();

  const loadData = useCallback(async () => {
    const data = await getShoppingLists();
    setLists(filterPendingDeletes(data, 'shoppingList', (l) => l.id));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => subscribePendingDeletes(loadData), [loadData]);

  const openRename = (list: ShoppingListWithCounts) =>
    router.push(`/shopping/${list.id}?rename=1`);

  const handleDelete = (list: ShoppingListWithCounts) => {
    showUndoDelete(pendingDeleteKey('shoppingList', list.id), list.name, () =>
      deleteShoppingList(list.id)
    );
  };

  const handleLongPress = (list: ShoppingListWithCounts) => {
    lightTap();
    setMenuList(list);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {t('shopping.title')}
        </Text>
      </View>

      {lists.length === 0 ? (
        <EmptyState
          icon="cart-outline"
          title={t('shopping.emptyTitle')}
          text={t('shopping.emptyText')}
          actionLabel={t('shopping.emptyAction')}
          onAction={() => router.push('/shopping/new')}
        />
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const counts = progressCounts(item);
            const label = counts
              ? t('shopping.inCart', {
                  checked: counts.checkedCount,
                  total: counts.totalCount,
                })
              : null;
            const progress = counts
              ? counts.checkedCount / counts.totalCount
              : 0;
            return (
              <SwipeableRow
                onEdit={() => openRename(item)}
                editLabel={t('shopping.rename')}
                onDelete={() => handleDelete(item)}
              >
                <Pressable
                  style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                  onPress={() => router.push(`/shopping/${item.id}`)}
                  onLongPress={() => handleLongPress(item)}
                  accessibilityRole="button"
                  accessibilityLabel={label ? `${item.name}, ${label}` : item.name}
                >
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {label ? (
                      <View style={styles.metaRow}>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              { width: `${Math.round(progress * 100)}%` },
                            ]}
                          />
                        </View>
                        <Text style={styles.cardMeta}>{label}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
                </Pressable>
              </SwipeableRow>
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
      {lists.length > 0 ? (
        // Tab bar already sits below — no extra bottom inset needed
        <Fab
          accessibilityLabel={t('a11y.addList')}
          onPress={() => router.push('/shopping/new')}
          withBottomInset={false}
        />
      ) : null}

      <ActionSheet
        visible={menuList !== null}
        title={menuList?.name}
        onClose={() => setMenuList(null)}
        actions={
          menuList
            ? [
                {
                  label: t('shopping.rename'),
                  icon: 'create-outline',
                  onPress: () => openRename(menuList),
                },
                {
                  label: t('shopping.deleteList'),
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => handleDelete(menuList),
                },
              ]
            : []
        }
      />
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
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
    list: {
      paddingHorizontal: Spacing.base,
      // Clears the floating action button.
      paddingBottom: Spacing.xxxl * 2,
      gap: Spacing.sm,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: Touch.list,
      backgroundColor: c.surface,
      borderRadius: Radius.md,
      paddingVertical: Spacing.base,
      paddingHorizontal: Spacing.base,
      gap: Spacing.md,
      ...Shadow.sm,
    },
    // Opaque pressed state — the card sits over the swipe-action panel, so it
    // must never go translucent (the panel would show through).
    cardPressed: {
      backgroundColor: c.surfaceAlt,
    },
    cardBody: {
      flex: 1,
      gap: Spacing.sm,
    },
    cardTitle: {
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.semibold,
      color: c.text,
      lineHeight: Typography.size.md * 1.3,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    progressTrack: {
      flex: 1,
      maxWidth: 96,
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: c.surfaceAlt,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: Radius.full,
      backgroundColor: c.primary,
    },
    cardMeta: {
      fontSize: Typography.size.sm,
      color: c.textMuted,
    },
  });
