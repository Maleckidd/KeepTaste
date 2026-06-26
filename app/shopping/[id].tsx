import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getShoppingListById,
  getItemsForList,
  createShoppingItem,
  updateShoppingItem,
  updateShoppingListName,
  setItemChecked,
  deleteShoppingItem,
  deleteShoppingList,
} from '@/db/shoppingLists';
import {
  partitionItems,
  normalizeItemInput,
  validateItemName,
} from '@/utils/shoppingList';
import {
  pendingDeleteKey,
  filterPendingDeletes,
  subscribePendingDeletes,
} from '@/utils/pendingDelete';
import { useUndoDelete, useSnackbar } from '@/components/ui/SnackbarProvider';
import { lightTap } from '@/utils/haptics';
import { animateLayout } from '@/utils/motion';
import { pluralPl } from '@/utils/i18n';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Touch,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import EmptyState from '@/components/ui/EmptyState';
import IconButton from '@/components/ui/IconButton';
import Input from '@/components/ui/Input';
import Fab from '@/components/ui/Fab';
import ActionSheet from '@/components/ui/ActionSheet';
import SwipeableRow from '@/components/ui/SwipeableRow';
import PasteListSheet from '@/components/shopping/PasteListSheet';
import type { ShoppingList, ShoppingItem } from '@/db/schema';
import type { TranslationKey } from '@/i18n/dictionary';

type Row =
  | { kind: 'item'; item: ShoppingItem }
  | { kind: 'header'; key: string };

// Reuses §5.12's plural keys for the "added N products" snackbar.
const addedKeys: Record<ReturnType<typeof pluralPl>, TranslationKey> = {
  one: 'addToList.added.one',
  few: 'addToList.added.few',
  many: 'addToList.added.many',
};

export default function ShoppingListScreen() {
  const { id, rename } = useLocalSearchParams<{ id: string; rename?: string }>();
  const listId = Number(id);
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c), [c]);
  const nameInputRef = useRef<TextInput>(null);
  const titleInputRef = useRef<TextInput>(null);

  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  // Non-null while the inline row edits an existing item instead of adding.
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [menuItem, setMenuItem] = useState<ShoppingItem | null>(null);
  const [listMenuOpen, setListMenuOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  // Inline title rename (replaces the old "Rename list" modal).
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const showUndoDelete = useUndoDelete();
  const { showSnackbar } = useSnackbar();

  const loadData = useCallback(async () => {
    const [l, data] = await Promise.all([
      getShoppingListById(listId),
      getItemsForList(listId),
    ]);
    setList(l ?? null);
    setItems(filterPendingDeletes(data, 'shoppingItem', (item) => item.id));
  }, [listId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => subscribePendingDeletes(loadData), [loadData]);

  // Entering via "Rename" on the lists screen opens the title editor directly.
  useEffect(() => {
    if (rename === '1' && list && !renaming) startRename(list.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rename, list?.id]);

  const startRename = (currentName: string) => {
    setTitleDraft(currentName);
    setRenaming(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  const commitRename = async () => {
    const trimmed = titleDraft.trim();
    setRenaming(false);
    // Empty input cancels the rename instead of saving a blank name.
    if (!trimmed || !list || trimmed === list.name) return;
    await updateShoppingListName(listId, trimmed);
    loadData();
  };

  const handleToggle = async (item: ShoppingItem) => {
    lightTap();
    await setItemChecked(item.id, !item.checked);
    // Animate the row sliding between the active and "in cart" sections.
    animateLayout();
    loadData();
  };

  // No animateLayout() here: LayoutAnimation.configureNext is global and
  // would also catch the snackbar mounting in the same frame, making it
  // flicker or not appear at all.
  const handleDeleteItem = (item: ShoppingItem) => {
    if (editingItemId === item.id) closeRow();
    showUndoDelete(pendingDeleteKey('shoppingItem', item.id), item.name, () =>
      deleteShoppingItem(item.id)
    );
  };

  const handleDeleteList = () => {
    if (!list) return;
    showUndoDelete(
      pendingDeleteKey('shoppingList', list.id),
      list.name,
      () => deleteShoppingList(list.id)
    );
    router.back();
  };

  const handleItemLongPress = (item: ShoppingItem) => {
    lightTap();
    setMenuItem(item);
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
    animateLayout();
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
      <SwipeableRow
        onEdit={() => openEdit(item)}
        onDelete={() => handleDeleteItem(item)}
      >
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handleToggle(item)}
          onLongPress={() => handleItemLongPress(item)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isChecked }}
          accessibilityLabel={
            item.quantity ? `${item.name}, ${item.quantity}` : item.name
          }
        >
          <View style={styles.rowBody}>
            <Text
              style={[styles.itemName, isChecked && styles.itemNameChecked]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            {item.quantity ? (
              <Text
                style={[styles.itemQty, isChecked && styles.itemNameChecked]}
              >
                {item.quantity}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
            size={28}
            color={isChecked ? c.primary : c.textMuted}
          />
        </Pressable>
      </SwipeableRow>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
    >
      {/* Header with inline-renamable title */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.sm }]}>
        <IconButton
          icon="arrow-back"
          accessibilityLabel={t('a11y.back')}
          onPress={() => router.back()}
        />
        {renaming ? (
          <Input
            ref={titleInputRef}
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onSubmitEditing={commitRename}
            onBlur={commitRename}
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={t('shopping.rename')}
          />
        ) : (
          <Pressable
            style={styles.titleWrap}
            onPress={() => list && startRename(list.name)}
            accessibilityRole="button"
            accessibilityLabel={list?.name ?? ''}
            accessibilityHint={t('shopping.rename')}
          >
            <Text style={styles.title} numberOfLines={1}>
              {list?.name ?? ''}
            </Text>
            <Ionicons name="pencil-outline" size={14} color={c.textMuted} />
          </Pressable>
        )}
        <IconButton
          icon="ellipsis-horizontal"
          accessibilityLabel={t('a11y.moreActions')}
          onPress={() => setListMenuOpen(true)}
        />
      </View>

      {items.length === 0 && !addOpen ? (
        <EmptyState
          icon="cart-outline"
          title={t('shoppingList.emptyTitle')}
          text={t('shoppingList.emptyText')}
          actionLabel={t('shoppingList.addProduct')}
          onAction={openAdd}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) =>
            row.kind === 'header' ? row.key : `item-${row.item.id}`
          }
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <Text style={styles.sectionHeader} accessibilityRole="header">
                {t('shoppingList.inCartHeader')}
              </Text>
            ) : (
              renderItem(row.item)
            )
          }
          contentContainerStyle={[
            styles.list,
            // Keep the last rows reachable above the FAB.
            { paddingBottom: Spacing.xxxl + Touch.list + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Inline add/edit row — pinned to the bottom, in thumb range */}
      {addOpen ? (
        <View
          style={[
            styles.addRow,
            { paddingBottom: Spacing.md + insets.bottom },
          ]}
        >
          <Input
            ref={nameInputRef}
            style={styles.addNameInput}
            placeholder={
              editingItemId !== null
                ? t('shoppingList.productNamePlaceholder')
                : t('shoppingList.addProductPlaceholder')
            }
            value={name}
            onChangeText={setName}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <Input
            style={styles.addQtyInput}
            placeholder={t('shoppingList.qtyPlaceholder')}
            value={quantity}
            onChangeText={setQuantity}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
          />
          <IconButton
            icon={editingItemId !== null ? 'checkmark' : 'add'}
            size={24}
            color={c.onPrimary}
            accessibilityLabel={t('a11y.confirmProduct')}
            onPress={handleConfirm}
            style={styles.confirmButton}
          />
          <IconButton
            icon="close"
            size={22}
            color={c.textSecondary}
            accessibilityLabel={t('a11y.close')}
            onPress={closeRow}
          />
        </View>
      ) : items.length > 0 ? (
        // FAB — the primary "add product" action stays in the thumb zone.
        <Fab accessibilityLabel={t('a11y.addProduct')} onPress={openAdd} />
      ) : null}

      {/* Item context menu (long-press) */}
      <ActionSheet
        visible={menuItem !== null}
        title={menuItem?.name}
        onClose={() => setMenuItem(null)}
        actions={
          menuItem
            ? [
                {
                  label: t('common.edit'),
                  icon: 'create-outline',
                  onPress: () => openEdit(menuItem),
                },
                {
                  label: t('common.delete'),
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => handleDeleteItem(menuItem),
                },
              ]
            : []
        }
      />

      {/* List menu ("…" in the header) */}
      <ActionSheet
        visible={listMenuOpen}
        title={list?.name}
        onClose={() => setListMenuOpen(false)}
        actions={[
          {
            label: t('shopping.rename'),
            icon: 'create-outline',
            onPress: () => list && startRename(list.name),
          },
          {
            label: t('shoppingList.pasteProducts'),
            icon: 'clipboard-outline',
            onPress: () => setPasteOpen(true),
          },
          {
            label: t('shopping.deleteList'),
            icon: 'trash-outline',
            destructive: true,
            onPress: handleDeleteList,
          },
        ]}
      />

      {/* Paste products into this list (§5.16) */}
      <PasteListSheet
        visible={pasteOpen}
        listId={listId}
        onClose={() => setPasteOpen(false)}
        onAdded={(count) => {
          // No animateLayout() here: it would catch the snackbar mounting in
          // the same frame (see handleDeleteItem).
          loadData();
          showSnackbar({
            message: t(addedKeys[pluralPl(count)], {
              count,
              name: list?.name ?? '',
            }),
          });
        }}
      />
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
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      gap: Spacing.xs,
    },
    titleWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: Touch.min,
    },
    title: {
      flexShrink: 1,
      fontSize: Typography.size.xl,
      fontWeight: Typography.weight.bold,
      color: c.text,
      letterSpacing: -0.3,
    },
    titleInput: {
      flex: 1,
      fontSize: Typography.size.lg,
      fontWeight: Typography.weight.semibold,
    },
    list: {
      paddingHorizontal: Spacing.base,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: Touch.list,
      paddingVertical: Spacing.sm,
      gap: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      backgroundColor: c.background,
    },
    rowPressed: {
      backgroundColor: c.surfaceAlt,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    itemName: {
      fontSize: Typography.size.md,
      color: c.text,
      flexShrink: 1,
    },
    itemNameChecked: {
      color: c.textMuted,
      textDecorationLine: 'line-through',
    },
    itemQty: {
      fontSize: Typography.size.sm,
      color: c.textSecondary,
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
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    addNameInput: {
      flex: 1,
      backgroundColor: c.surfaceAlt,
      borderWidth: 0,
    },
    addQtyInput: {
      width: 72,
      backgroundColor: c.surfaceAlt,
      borderWidth: 0,
      fontSize: Typography.size.sm,
    },
    confirmButton: {
      backgroundColor: c.primary,
    },
  });
