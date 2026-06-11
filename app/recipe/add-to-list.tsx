import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
      Alert.alert(
        t('addToList.addedTitle'),
        t(addedKeys[pluralPl(names.length)], {
          count: names.length,
          name: listName,
        }),
        [
          {
            text: t('addToList.viewList'),
            onPress: () => router.push(`/shopping/${listId}`),
          },
          { text: t('addToList.ok') },
        ]
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isLoaded) return null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('addToList.title')}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color={c.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {t('addToList.products')} ({checkedCount}/{candidates.length})
            </Text>
            <TouchableOpacity onPress={toggleAll}>
              <Text style={styles.toggleAll}>
                {allChecked
                  ? t('addToList.selectNone')
                  : t('addToList.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {candidates.map((name, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.row, index > 0 && styles.rowBorder]}
                onPress={() => toggleItem(index)}
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
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, styles.targetTitle]}>
            {t('addToList.targetList')}
          </Text>

          <View style={styles.card}>
            {lists.map((list, index) => (
              <TouchableOpacity
                key={list.id}
                style={[styles.row, index > 0 && styles.rowBorder]}
                onPress={() => setTarget(list.id)}
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
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.row, lists.length > 0 && styles.rowBorder]}
              onPress={() => setTarget(NEW_LIST)}
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
            </TouchableOpacity>
            {target === NEW_LIST ? (
              <View style={styles.newListInputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder={t('shoppingNew.placeholder')}
                  placeholderTextColor={c.textMuted}
                  value={newListName}
                  onChangeText={setNewListName}
                  returnKeyType="done"
                />
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            onPress={handleAdd}
            style={[styles.primaryButton, !canSubmit && styles.disabled]}
            disabled={!canSubmit}
          >
            <Text style={styles.primaryButtonText}>
              {checkedCount === 0
                ? t('addToList.addDisabled')
                : t(addKeys[pluralPl(checkedCount)], { count: checkedCount })}
            </Text>
          </TouchableOpacity>
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      fontSize: Typography.size.md,
      fontWeight: Typography.weight.semibold,
      color: c.text,
    },
    closeButton: {
      padding: Spacing.xs,
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
    input: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: Typography.size.base,
      color: c.text,
    },
    primaryButton: {
      backgroundColor: c.primary,
      paddingVertical: Spacing.md,
      borderRadius: Radius.full,
      alignItems: 'center',
      marginTop: Spacing.lg,
    },
    disabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      fontSize: Typography.size.base,
      fontWeight: Typography.weight.semibold,
      color: '#FFFFFF',
    },
  });
