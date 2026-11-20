import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Share,
  AccessibilityInfo,
  useWindowDimensions,
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
  groupedNames,
  buildActiveRows,
  classifyAddRowChange,
  collapseLineBreaks,
  togglePendingCheck,
  inCartPillVisible,
} from '@/utils/shoppingList';
import {
  pendingDeleteKey,
  filterPendingDeletes,
  subscribePendingDeletes,
} from '@/utils/pendingDelete';
import { useUndoDelete, useSnackbar } from '@/components/ui/SnackbarProvider';
import { lightTap } from '@/utils/haptics';
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
import { useTimerBarClearance } from '@/components/timers/TimerProvider';
import ActionSheet from '@/components/ui/ActionSheet';
import SwipeableRow from '@/components/ui/SwipeableRow';
import PasteListSheet from '@/components/shopping/PasteListSheet';
import SendListSheet from '@/components/shopping/SendListSheet';
import {
  CheckOffMotion,
  PopCheck,
  InCartPill,
  CHECK_OFF_DELAY_MS,
} from '@/components/shopping/CheckOffMotion';
import { buildShoppingListShareText } from '@/utils/shoppingListShareText';
import type { ShoppingList, ShoppingItem } from '@/db/schema';
import type { TranslationKey } from '@/i18n/dictionary';

type Row =
  | { kind: 'item'; item: ShoppingItem; isRepeat: boolean }
  | { kind: 'groupHeader'; name: string; count: number; childIds: number[] }
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
  const timerClearance = useTimerBarClearance();
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
  // Products parsed from a paste into the add row; the sheet opens on Review.
  const [pasteProducts, setPasteProducts] = useState<string[] | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  // Inline title rename (replaces the old "Rename list" modal).
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const showUndoDelete = useUndoDelete();
  const { showSnackbar } = useSnackbar();
  const listRef = useRef<FlatList<Row>>(null);
  // Rows playing their check-off animation, not yet written as checked
  // (§5.10). The ref mirrors the state for the timers' closures.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set());
  const pendingRef = useRef<ReadonlySet<number>>(new Set());
  const checkTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Ids whose timers fired in the same tick — written in one batch.
  const dueChecks = useRef<number[]>([]);
  // Whether the "In cart" section is on screen; the pill hides while it is.
  const [cartInView, setCartInView] = useState(false);
  const cartHeaderRef = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();

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

  const setPending = (next: ReadonlySet<number>) => {
    pendingRef.current = next;
    setPendingIds(next);
  };

  const flushDueChecks = async () => {
    const ids = dueChecks.current;
    dueChecks.current = [];
    if (ids.length === 0) return;
    // One check-off time per batch: a group header's children land in the
    // cart together, in a stable order (sortShoppingItems).
    const at = new Date().toISOString();
    await Promise.all(ids.map((id) => setItemChecked(id, true, at)));
    await loadData();
    const next = new Set(pendingRef.current);
    ids.forEach((id) => next.delete(id));
    setPending(next);
  };

  // No animateLayout() on toggle: a toggle can add/remove a group-header row
  // (a structural list change), and LayoutAnimation reparents cells in the
  // virtualized list on Android — crashing with "child already has a parent"
  // (and IndexOutOfBounds in subview clipping) when Reanimated is present.
  // The check-off motion runs on the row's own Animated values instead.
  //
  // Checking is deferred by CHECK_OFF_DELAY_MS: the row plays its animation,
  // then moves to "In cart", where the "In cart · N" pill bumps (§5.10). A
  // second tap inside the window cancels — that replaces the old Undo
  // snackbar for a mis-tap. Unchecking is immediate.
  const startOrCancelCheck = (ids: number[], label: string) => {
    const { action, next } = togglePendingCheck(pendingRef.current, ids);
    setPending(next);
    ids.forEach((id) => {
      clearTimeout(checkTimers.current.get(id));
      checkTimers.current.delete(id);
    });
    if (action === 'cancel') return;
    ids.forEach((id) => {
      checkTimers.current.set(
        id,
        setTimeout(() => {
          checkTimers.current.delete(id);
          dueChecks.current.push(id);
          if (dueChecks.current.length === 1) setTimeout(flushDueChecks, 0);
        }, CHECK_OFF_DELAY_MS)
      );
    });
    // The visual "where did it go" cue doesn't reach screen readers.
    AccessibilityInfo.announceForAccessibility(
      t('shoppingList.movedToCart', { name: label })
    );
  };

  // Leaving the screen mid-animation still checks the row off.
  useEffect(() => {
    const timers = checkTimers.current;
    return () => {
      const at = new Date().toISOString();
      timers.forEach((timer, id) => {
        clearTimeout(timer);
        setItemChecked(id, true, at);
      });
      timers.clear();
    };
  }, []);

  const handleToggle = async (item: ShoppingItem) => {
    lightTap();
    if (item.checked) {
      await setItemChecked(item.id, false);
      loadData();
      return;
    }
    startOrCancelCheck([item.id], item.name);
  };

  // Tapping a group header checks all its remaining active children at once.
  const handleToggleGroup = (name: string, childIds: number[]) => {
    lightTap();
    startOrCancelCheck(childIds, `${name} (${childIds.length})`);
  };

  // The cart counts as "on screen" once its header sits above the FAB row —
  // measured in the window, not via FlatList viewability: right after a
  // check the moved row's cached frame is stale (still at the top), and the
  // viewability callback could settle on "visible" with the cart off screen.
  // A header just peeking out behind the FAB doesn't count. Unmounted (no
  // cart, or virtualized away) reads as off screen.
  const checkCartInView = useCallback(() => {
    const node = cartHeaderRef.current;
    if (!node) {
      setCartInView(false);
      return;
    }
    const visibleBottom =
      windowHeight - insets.bottom - timerClearance - (Touch.list + 2 * Spacing.lg);
    node.measureInWindow((_x, y) => setCartInView(y < visibleBottom));
  }, [windowHeight, insets.bottom, timerClearance]);

  // Rows moved (check, uncheck, add, delete): re-measure after they lay out.
  useEffect(() => {
    const frame = requestAnimationFrame(checkCartInView);
    return () => cancelAnimationFrame(frame);
  }, [items, checkCartInView]);

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

  const handleShareList = async (selected: ShoppingItem[]) => {
    if (!list) return;
    try {
      await Share.share({
        message: buildShoppingListShareText(list.name, selected),
        title: t('shopping.shareDialogTitle'),
      });
    } catch {
      // User dismissed or share unavailable — nothing to recover.
    }
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
      // Clear the fields BEFORE the insert: typing that lands while the write
      // is in flight must start the next product, not extend this one.
      setName('');
      setQuantity('');
      nameInputRef.current?.focus();
      await createShoppingItem(listId, normalized.name, normalized.quantity);
    }
    // No animateLayout(): adding a 2nd copy of a name makes a group header
    // appear — a structural list change LayoutAnimation crashes on (see
    // handleToggle).
    loadData();
  };

  // The name field is single-line; a multi-line paste into it is detected
  // here (§5.10): 2+ products open the paste sheet on Review, one product
  // goes into the field, a typed line break is swallowed.
  const handleNameChange = (next: string) => {
    const change = classifyAddRowChange(name, next);
    if (change.kind === 'paste') {
      if (editingItemId === null) {
        setName('');
        setPasteProducts(change.products);
        setPasteOpen(true);
      } else {
        // Editing one product: a pasted list can't become several items.
        setName(collapseLineBreaks(next));
      }
      return;
    }
    setName(change.value);
  };

  const openPasteSheet = () => {
    setPasteProducts(null);
    setPasteOpen(true);
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
  // Cluster same-name products under a virtual header so multiples are managed
  // together. A header appears only for a name with 2+ ACTIVE copies; in-cart
  // copies don't count (§5.10), so a lone remaining copy is a plain row. Purely
  // presentational — items stay separate rows in the DB; nothing is merged.
  // In-cart stays flat.
  const grouped = groupedNames(active);
  const activeRows = buildActiveRows(active, grouped);

  const rows: Row[] = [
    ...activeRows.map((r) =>
      r.kind === 'groupHeader'
        ? {
            kind: 'groupHeader' as const,
            name: r.name,
            count: r.count,
            childIds: r.childIds,
          }
        : { kind: 'item' as const, item: r.item, isRepeat: r.isRepeat }
    ),
    ...(inCart.length > 0
      ? [{ kind: 'header' as const, key: 'in-cart' }]
      : []),
    ...inCart.map((item) => ({ kind: 'item' as const, item, isRepeat: false })),
  ];

  const renderGroupHeader = (row: {
    name: string;
    count: number;
    childIds: number[];
  }) => {
    const isPending = row.childIds.every((id) => pendingIds.has(id));
    return (
      <CheckOffMotion active={isPending}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => handleToggleGroup(row.name, row.childIds)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: false }}
          accessibilityLabel={t('a11y.checkAllInGroup', {
            name: row.name,
            count: row.count,
          })}
        >
          <View style={styles.rowBody}>
            <Text
              style={[styles.itemName, styles.groupHeaderName]}
              numberOfLines={2}
            >
              {row.name}
            </Text>
            <Text style={styles.groupHeaderCount}>{`(${row.count})`}</Text>
          </View>
          <PopCheck checked={isPending} color={isPending ? c.primary : c.textMuted} />
        </Pressable>
      </CheckOffMotion>
    );
  };

  const renderItem = (item: ShoppingItem, isRepeat: boolean) => {
    // Pending = playing the check-off animation, still in the active section.
    const isPending = !item.checked && pendingIds.has(item.id);
    const isChecked = !!item.checked || isPending;
    return (
      <SwipeableRow
        onEdit={() => openEdit(item)}
        onDelete={() => handleDeleteItem(item)}
      >
        <CheckOffMotion active={isPending}>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              isRepeat && styles.rowRepeat,
              pressed && styles.rowPressed,
            ]}
            onPress={() => handleToggle(item)}
            onLongPress={() => handleItemLongPress(item)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isChecked }}
            accessibilityLabel={
              item.quantity ? `${item.name}, ${item.quantity}` : item.name
            }
          >
            <View style={[styles.rowBody, isRepeat && styles.rowBodyRepeat]}>
              <Text
                style={[
                  styles.itemName,
                  isRepeat && styles.itemNameRepeat,
                  isChecked && styles.itemNameChecked,
                ]}
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
            <PopCheck checked={isChecked} color={isChecked ? c.primary : c.textMuted} />
          </Pressable>
        </CheckOffMotion>
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
          actionTestID="shopping-empty-add"
        />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          onScroll={checkCartInView}
          scrollEventThrottle={100}
          onContentSizeChange={checkCartInView}
          // Rows vary in height, so a jump to the cart header can miss the
          // render window — fall back to the end, where the cart sits.
          onScrollToIndexFailed={() => listRef.current?.scrollToEnd({ animated: true })}
          keyExtractor={(row) =>
            row.kind === 'header'
              ? 'section-in-cart'
              : row.kind === 'groupHeader'
              ? `group-${row.name.trim().toLowerCase()}`
              : `item-${row.item.id}`
          }
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <View ref={cartHeaderRef} collapsable={false} onLayout={checkCartInView}>
                <Text style={styles.sectionHeader} accessibilityRole="header">
                  {t('shoppingList.inCartHeader')}
                </Text>
              </View>
            ) : row.kind === 'groupHeader' ? (
              renderGroupHeader(row)
            ) : (
              renderItem(row.item, row.isRepeat)
            )
          }
          contentContainerStyle={[
            styles.list,
            // Keep the last rows reachable above the FAB.
            { paddingBottom: Spacing.xxxl + Touch.list + insets.bottom + timerClearance },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Android's default subview clipping crashes (IndexOutOfBounds in
          // updateSubviewClipStatus) when animateLayout() runs while rows are
          // structurally added/removed — e.g. a group header appearing or
          // "check all" moving several rows at once. The list is short, so
          // disabling clipping is free and removes the buggy native path.
          removeClippedSubviews={false}
        />
      )}

      {/* Inline add/edit row — pinned to the bottom, in thumb range */}
      {addOpen ? (
        <View
          style={[
            styles.addPanel,
            // Lifted clear of the timer bar (SPEC.md §5.21).
            { paddingBottom: Spacing.md + insets.bottom + timerClearance },
          ]}
        >
          <View style={styles.addRow}>
            <Input
              ref={nameInputRef}
              style={styles.addNameInput}
              placeholder={
                editingItemId !== null
                  ? t('shoppingList.productNamePlaceholder')
                  : t('shoppingList.addProductPlaceholder')
              }
              value={name}
              onChangeText={handleNameChange}
              testID="shopping-item-name"
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />
            <Input
              style={styles.addQtyInput}
              placeholder={t('shoppingList.qtyPlaceholder')}
              testID="shopping-item-qty"
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
              testID="shopping-item-confirm"
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
          {editingItemId === null ? (
            <Pressable
              style={({ pressed }) => [
                styles.pasteLink,
                pressed && styles.pasteLinkPressed,
              ]}
              onPress={openPasteSheet}
              accessibilityRole="button"
            >
              <Text style={styles.pasteLinkText}>
                {t('shoppingList.pasteWholeList')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : items.length > 0 ? (
        // FAB — the primary "add product" action stays in the thumb zone.
        <Fab
          accessibilityLabel={t('a11y.addProduct')}
          onPress={openAdd}
          testID="shopping-add-product"
          leading={
            <InCartPill
              label={t('shoppingList.inCartHeader')}
              accessibilityLabel={t('a11y.showCart', { count: inCart.length })}
              count={inCart.length}
              visible={inCartPillVisible({ inCartCount: inCart.length, cartInView })}
              onPress={() =>
                listRef.current?.scrollToIndex({
                  index: activeRows.length,
                  viewPosition: 0,
                  animated: true,
                })
              }
            />
          }
        />
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
            onPress: openPasteSheet,
          },
          {
            label: t('shopping.shareList', { count: active.length }),
            icon: 'share-outline',
            onPress: () =>
              // Nothing to choose from: only the list name goes out (§5.18).
              active.length > 0 ? setSendOpen(true) : handleShareList(active),
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
        initialProducts={pasteProducts}
        onClose={() => {
          setPasteOpen(false);
          setPasteProducts(null);
        }}
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

      {/* Choose what goes out before the share sheet (§5.18) */}
      <SendListSheet
        visible={sendOpen}
        items={active}
        onClose={() => setSendOpen(false)}
        onSend={handleShareList}
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
    // A repeat of the product above: subtly recessed (tinted bg) and indented
    // so it reads as belonging to the row above without a count badge.
    rowRepeat: {
      backgroundColor: c.surfaceAlt,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    rowBodyRepeat: {
      paddingLeft: Spacing.lg,
    },
    itemName: {
      fontSize: Typography.size.md,
      color: c.text,
      flexShrink: 1,
    },
    itemNameRepeat: {
      fontSize: Typography.size.sm,
      color: c.textSecondary,
    },
    groupHeaderName: {
      fontWeight: Typography.weight.semibold,
    },
    groupHeaderCount: {
      fontSize: Typography.size.sm,
      color: c.textMuted,
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
    addPanel: {
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    pasteLink: {
      minHeight: Touch.min,
      alignSelf: 'flex-start',
      justifyContent: 'center',
    },
    pasteLinkPressed: {
      opacity: 0.6,
    },
    pasteLinkText: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.primary,
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
