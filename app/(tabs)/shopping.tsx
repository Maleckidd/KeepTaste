import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getShoppingLists,
  deleteShoppingList,
  type ShoppingListWithCounts,
} from '@/db/shoppingLists';
import { progressCounts } from '@/utils/shoppingList';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';

export default function ShoppingScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [lists, setLists] = useState<ShoppingListWithCounts[]>([]);

  const loadData = useCallback(async () => {
    setLists(await getShoppingLists());
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleLongPress = (list: ShoppingListWithCounts) => {
    Alert.alert(list.name, t('common.whatToDo'), [
      {
        text: t('shopping.rename'),
        onPress: () => router.push(`/shopping/edit?id=${list.id}`),
      },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(list.name, t('shopping.deleteListMessage'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'),
              style: 'destructive',
              onPress: async () => {
                await deleteShoppingList(list.id);
                loadData();
              },
            },
          ]),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>{t('shopping.brand')}</Text>
          <Text style={styles.headerTitle}>{t('shopping.title')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/shopping/new')}
          style={styles.addButton}
        >
          <Ionicons name="add" size={26} color={c.primary} />
        </TouchableOpacity>
      </View>

      {lists.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={56} color={c.border} />
          <Text style={styles.emptyTitle}>{t('shopping.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('shopping.emptyText')}</Text>
        </View>
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
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/shopping/${item.id}`)}
                onLongPress={() => handleLongPress(item)}
                activeOpacity={0.8}
              >
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {label ? (
                    <Text style={styles.cardMeta}>{label}</Text>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.border} />
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
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
    addButton: {
      width: 44,
      height: 44,
      borderRadius: Radius.full,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...Shadow.sm,
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
      paddingVertical: Spacing.base,
      paddingHorizontal: Spacing.base,
      gap: Spacing.md,
      ...Shadow.sm,
    },
    cardBody: {
      flex: 1,
      gap: Spacing.xs,
    },
    cardTitle: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: c.text,
      lineHeight: Typography.size.base * 1.3,
    },
    cardMeta: {
      fontSize: Typography.size.xs,
      color: c.textMuted,
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
