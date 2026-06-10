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
import { progressLabel } from '@/utils/shoppingList';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';

export default function ShoppingScreen() {
  const router = useRouter();
  const c = useTheme();
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
    Alert.alert(list.name, 'What would you like to do?', [
      {
        text: 'Rename',
        onPress: () => router.push(`/shopping/edit?id=${list.id}`),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert(list.name, 'Delete this shopping list?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteShoppingList(list.id);
                loadData();
              },
            },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>KeepTaste</Text>
          <Text style={styles.headerTitle}>Shopping</Text>
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
          <Text style={styles.emptyTitle}>No shopping lists</Text>
          <Text style={styles.emptyText}>
            Tap + to create your first list
          </Text>
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const label = progressLabel(item);
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
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
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
