import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getShoppingListById,
  getItemsForList,
  createShoppingItem,
  updateShoppingItem,
  setItemChecked,
  deleteShoppingItem,
} from '@/db/shoppingLists';
import {
  partitionItems,
  normalizeItemInput,
  validateItemName,
} from '@/utils/shoppingList';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import type { ShoppingList, ShoppingItem } from '@/db/schema';

type Row =
  | { kind: 'item'; item: ShoppingItem }
  | { kind: 'header'; key: string };

export default function ShoppingListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = Number(id);
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);
  const nameInputRef = useRef<TextInput>(null);

  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  // Non-null while the inline row edits an existing item instead of adding.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    const [l, data] = await Promise.all([
      getShoppingListById(listId),
      getItemsForList(listId),
    ]);
    setList(l ?? null);
    setItems(data);
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleToggle = async (item: ShoppingItem) => {
    await setItemChecked(item.id, !item.checked);
    loadData();
  };

  const handleItemLongPress = (item: ShoppingItem) => {
    Alert.alert(item.name, t('common.whatToDo'), [
      { text: t('common.edit'), onPress: () => openEdit(item) },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteShoppingItem(item.id);
          if (editingItemId === item.id) closeRow();
          loadData();
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleConfirm = async () => {
    const normalized = normalizeItemInput({ name, quantity });
    if (!validateItemName(normalized.name)) return;
    if (editingItemId !== null) {
      await updateShoppingItem(editingItemId, normalized.name, normalized.quantity);
      closeRow();
    } else {
      await createShoppingItem(listId, normalized.name, normalized.quantity);
      setName('');
      setQuantity('');
      nameInputRef.current?.focus();
    }
    loadData();
  };

  const openAdd = () => {
    setEditingItemId(null);
    setName('');
    setQuantity('');
    setAddOpen(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const openEdit = (item: ShoppingItem) => {
    setEditingItemId(item.id);
    setName(item.name);
    setQuantity(item.quantity ?? '');
    setAddOpen(true);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  };

  const closeRow = () => {
    setAddOpen(false);
    setEditingItemId(null);
    setName('');
    setQuantity('');
  };

  const { active, inCart } = partitionItems(items);

  const rows: Row[] = [
    ...active.map((item) => ({ kind: 'item' as const, item })),
    ...(inCart.length > 0
      ? [{ kind: 'header' as const, key: 'in-cart' }]
      : []),
    ...inCart.map((item) => ({ kind: 'item' as const, item })),
  ];

  const renderItem = (item: ShoppingItem) => {
    const isChecked = !!item.checked;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => handleToggle(item)}
        onLongPress={() => handleItemLongPress(item)}
      >
        <View style={styles.rowBody}>
          <Text
            style={[styles.itemName, isChecked && styles.itemNameChecked]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          {item.quantity ? (
            <Text style={styles.itemQty}>{item.quantity}</Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => handleToggle(item)}
          hitSlop={8}
          style={styles.checkbox}
        >
          <Ionicons
            name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={isChecked ? c.primary : c.textMuted}
          />
        </Pressable>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {list?.name ?? ''}
        </Text>
        {items.length > 0 ? (
          <TouchableOpacity
            onPress={() => (addOpen ? closeRow() : openAdd())}
            style={styles.iconButton}
          >
            <Ionicons name="add" size={26} color={c.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>

      {items.length === 0 && !addOpen ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={48} color={c.border} />
          <Text style={styles.emptyTitle}>{t('shoppingList.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('shoppingList.emptyText')}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={openAdd}>
            <Text style={styles.primaryButtonText}>
              {t('shoppingList.addProduct')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) =>
            row.kind === 'header' ? row.key : `item-${row.item.id}`
          }
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <Text style={styles.sectionHeader}>{t('shoppingList.inCartHeader')}</Text>
            ) : (
              renderItem(row.item)
            )
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Inline add row */}
      {addOpen ? (
        <View style={styles.addRow}>
          <TextInput
            ref={nameInputRef}
            style={styles.addNameInput}
            placeholder={
              editingItemId !== null
                ? t('shoppingList.productNamePlaceholder')
                : t('shoppingList.addProductPlaceholder')
            }
            placeholderTextColor={c.textMuted}
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <TextInput
            style={styles.addQtyInput}
            placeholder={t('shoppingList.qtyPlaceholder')}
            placeholderTextColor={c.textMuted}
            value={quantity}
            onChangeText={setQuantity}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <TouchableOpacity onPress={handleConfirm} style={styles.confirmButton}>
            <Ionicons
              name={editingItemId !== null ? 'checkmark' : 'add'}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      ) : null}
    </KeyboardAvoidingView>
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
    iconButton: {
      padding: Spacing.xs,
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: {
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.xxxl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      gap: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    itemName: {
      fontSize: Typography.size.base,
      color: c.text,
      flexShrink: 1,
    },
    itemNameChecked: {
      color: c.textMuted,
      textDecorationLine: 'line-through',
    },
    itemQty: {
      fontSize: Typography.size.sm,
      color: c.textMuted,
    },
    checkbox: {
      padding: Spacing.xs,
    },
    sectionHeader: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: Spacing.lg,
      marginBottom: Spacing.xs,
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
    primaryButton: {
      backgroundColor: c.primary,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderRadius: Radius.full,
      marginTop: Spacing.sm,
    },
    primaryButtonText: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: '#FFFFFF',
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    addNameInput: {
      flex: 1,
      backgroundColor: c.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: Typography.size.base,
      color: c.text,
    },
    addQtyInput: {
      width: 72,
      backgroundColor: c.surfaceAlt,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: Typography.size.sm,
      color: c.text,
    },
    confirmButton: {
      width: 40,
      height: 40,
      borderRadius: Radius.full,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
