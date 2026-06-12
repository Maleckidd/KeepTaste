import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ModalHeader from '@/components/ui/ModalHeader';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useSnackbar } from '@/components/ui/SnackbarProvider';
import { getRecipeById } from '@/db/recipes';
import {
  getShoppingLists,
  createShoppingList,
  createShoppingItems,
  type ShoppingListWithCounts,
} from '@/db/shoppingLists';
import { parseIngredients } from '@/utils/ingredients';
import { pluralPl } from '@/utils/i18n';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
} from '@/constants/theme';
import { useT } from '@/i18n/LanguageProvider';
import type { TranslationKey } from '@/i18n/dictionary';

const NEW_LIST = 'new' as const;
type Target = number | typeof NEW_LIST;

const addKeys: Record<ReturnType<typeof pluralPl>, TranslationKey> = {
  one: 'addToList.add.one',
  few: 'addToList.add.few',
  many: 'addToList.add.many',
};
const addedKeys: Record<ReturnType<typeof pluralPl>, TranslationKey> = {
  one: 'addToList.added.one',
  few: 'addToList.added.few',
  many: 'addToList.added.many',
};

export default function AddToShoppingListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(c), [c]);

  const [candidates, setCandidates] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [lists, setLists] = useState<ShoppingListWithCounts[]>([]);
  const [target, setTarget] = useState<Target>(NEW_LIST);
  const [newListName, setNewListName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    (async () => {
      const recipe = await getRecipeById(Number(id));
      const allLists = await getShoppingLists();
      const parsed = recipe ? parseIngredients(recipe.ingredients) : [];
      setCandidates(parsed);
      setChecked(parsed.map(() => true));
      setLists(allLists);
      // Most recently used list is pre-selected (sorted desc by updated_at).
      setTarget(allLists.length > 0 ? allLists[0].id : NEW_LIST);
      setNewListName(recipe?.title ?? '');
      setIsLoaded(true);
    })();
  }, [id]);

  const checkedCount = checked.filter(Boolean).length;
  const allChecked = checkedCount === candidates.length;
  const canSubmit =
    checkedCount > 0 &&
    !isSaving &&
    (target !== NEW_LIST || newListName.trim() !== '');

  const toggleItem = (index: number) => {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  const toggleAll = () => {
    const next = !allChecked;
    setChecked(candidates.map(() => next));
  };

  const handleAdd = async () => {
    if (!canSubmit) return;
    const names = candidates.filter((_, i) => checked[i]);
    setIsSaving(true);
    try {
      let listId: number;
      let listName: string;
      if (target === NEW_LIST) {
        listName = newListName.trim();
        listId = await createShoppingList(listName);
      } else {
        listId = target;
        listName = lists.find((l) => l.id === target)?.name ?? '';
      }
      await createShoppingItems(listId, names);
      router.back();
      showSnackbar({
        message: t(addedKeys[pluralPl(names.length)], {
          count: names.length,
          name: listName,
        }),
        actionLabel: t('addToList.viewList'),
        onAction: () => router.push(`/shopping/${listId}`),
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoaded) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ModalHeader title={t('addToList.title')} onClose={() => router.back()} />

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t('addToList.products')} ({checkedCount}/{candidates.length})
            </Text>
            <Pressable
              onPress={toggleAll}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.toggleAll}>
                {allChecked
                  ? t('addToList.selectNone')
                  : t('addToList.selectAll')}
              </Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            {candidates.map((name, index) => (
              <Pressable
                key={index}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowBorder,
                  pressed && { backgroundColor: c.surfaceAlt },
                ]}
                onPress={() => toggleItem(index)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked[index] }}
                accessibilityLabel={name}
              >
                <Ionicons
                  name={checked[index] ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={checked[index] ? c.primary : c.textMuted}
                />
                <Text
                  style={[
                    styles.rowText,
                    !checked[index] && styles.rowTextMuted,
                  ]}
                >
                  {name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionTitle, styles.targetTitle]}>
            {t('addToList.targetList')}
          </Text>

          <View style={styles.card}>
            {lists.map((list, index) => (
              <Pressable
                key={list.id}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowBorder,
                  pressed && { backgroundColor: c.surfaceAlt },
                ]}
                onPress={() => setTarget(list.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: target === list.id }}
                accessibilityLabel={list.name}
              >
                <Ionicons
                  name={
                    target === list.id ? 'radio-button-on' : 'radio-button-off'
                  }
                  size={22}
                  color={target === list.id ? c.primary : c.textMuted}
                />
                <Text style={styles.rowText} numberOfLines={1}>
                  {list.name}
                </Text>
                {list.totalCount > 0 ? (
                  <Text style={styles.rowCount}>
                    {t('shopping.inCart', {
                      checked: list.checkedCount,
                      total: list.totalCount,
                    })}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [
                styles.row,
                lists.length > 0 && styles.rowBorder,
                pressed && { backgroundColor: c.surfaceAlt },
              ]}
              onPress={() => setTarget(NEW_LIST)}
              accessibilityRole="radio"
              accessibilityState={{ selected: target === NEW_LIST }}
              accessibilityLabel={t('addToList.newList')}
            >
              <Ionicons
                name={
                  target === NEW_LIST ? 'radio-button-on' : 'radio-button-off'
                }
                size={22}
                color={target === NEW_LIST ? c.primary : c.textMuted}
              />
              <Text style={[styles.rowText, styles.newListText]}>
                {t('addToList.newList')}
              </Text>
            </Pressable>
            {target === NEW_LIST ? (
              <View style={styles.newListInputWrap}>
                <Input
                  style={{ backgroundColor: c.background }}
                  placeholder={t('shoppingNew.placeholder')}
                  value={newListName}
                  onChangeText={setNewListName}
                  returnKeyType="done"
                />
              </View>
            ) : null}
          </View>

          <Button
            onPress={handleAdd}
            disabled={!canSubmit}
            loading={isSaving}
            label={
              checkedCount === 0
                ? t('addToList.addDisabled')
                : t(addKeys[pluralPl(checkedCount)], { count: checkedCount })
            }
            style={styles.submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ThemePalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    loading: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      padding: Spacing.base,
      paddingBottom: Spacing.xxxl,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    sectionTitle: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    targetTitle: {
      marginTop: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    toggleAll: {
      fontSize: Typography.size.sm,
      fontWeight: Typography.weight.semibold,
      color: c.primary,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      minHeight: 48,
    },
    rowBorder: {
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    rowText: {
      flex: 1,
      fontSize: Typography.size.base,
      color: c.text,
    },
    rowTextMuted: {
      color: c.textMuted,
    },
    rowCount: {
      fontSize: Typography.size.xs,
      color: c.textMuted,
    },
    newListText: {
      color: c.primary,
      fontWeight: Typography.weight.medium,
    },
    newListInputWrap: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.md,
    },
    submit: {
      marginTop: Spacing.lg,
    },
  });
