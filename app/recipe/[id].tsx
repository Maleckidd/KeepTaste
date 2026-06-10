import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { getRecipeById, deleteRecipe } from '@/db/recipes';
import { deleteStoredImage } from '@/utils/imageStorage';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import type { Recipe } from '@/db/schema';

function formatTime(minutes: number | null | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const loadData = useCallback(async () => {
    const r = await getRecipeById(Number(id));
    setRecipe(r || null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDelete = () => {
    Alert.alert(
      'Delete recipe',
      `Are you sure you want to delete "${recipe?.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRecipe(Number(id));
            await deleteStoredImage(recipe?.imagePath ?? null);
            router.back();
          },
        },
      ]
    );
  };

  if (!recipe) return null;

  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  return (
    <View style={styles.container}>
      {/* Nav bar with actions */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: '/recipe/edit', params: { id } })
            }
            style={styles.navButton}
          >
            <Ionicons name="create-outline" size={22} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.navButton}>
            <Ionicons name="trash-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Photo or placeholder */}
        {recipe.imagePath ? (
          <Image
            source={{ uri: recipe.imagePath }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.heroPlaceholder}>
            <Ionicons name="restaurant" size={48} color={Colors.border} />
          </View>
        )}

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{recipe.title}</Text>

          {/* Metadata */}
          <View style={styles.metaRow}>
            {recipe.prepTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="cut-outline" size={15} color={Colors.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>Prep</Text>
                  <Text style={styles.metaValue}>{formatTime(recipe.prepTime)}</Text>
                </View>
              </View>
            ) : null}
            {recipe.cookTime ? (
              <View style={styles.metaItem}>
                <Ionicons name="flame-outline" size={15} color={Colors.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>Cook</Text>
                  <Text style={styles.metaValue}>{formatTime(recipe.cookTime)}</Text>
                </View>
              </View>
            ) : null}
            {totalTime > 0 ? (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={15} color={Colors.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>Total</Text>
                  <Text style={styles.metaValue}>{formatTime(totalTime)}</Text>
                </View>
              </View>
            ) : null}
            {recipe.servings ? (
              <View style={styles.metaItem}>
                <Ionicons name="people-outline" size={15} color={Colors.textMuted} />
                <View>
                  <Text style={styles.metaLabel}>Servings</Text>
                  <Text style={styles.metaValue}>{recipe.servings}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Ingredients */}
          {recipe.ingredients ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <Markdown style={markdownStyles}>{recipe.ingredients}</Markdown>
            </View>
          ) : null}

          {/* Instructions */}
          {recipe.instructions ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Instructions</Text>
              <Markdown style={markdownStyles}>{recipe.instructions}</Markdown>
            </View>
          ) : null}

          {/* Notes */}
          {recipe.notes ? (
            <View style={styles.notesBox}>
              <View style={styles.notesHeader}>
                <Ionicons name="document-text-outline" size={15} color={Colors.primary} />
                <Text style={styles.notesTitle}>Notes</Text>
              </View>
              <Text style={styles.notesText}>{recipe.notes}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const markdownStyles = {
  body: {
    color: Colors.text,
    fontSize: Typography.size.base,
    lineHeight: Typography.size.base * 1.7,
  },
  heading1: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text,
    marginTop: Spacing.base,
    marginBottom: Spacing.sm,
  },
  heading2: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: Colors.text,
    marginTop: Spacing.base,
    marginBottom: Spacing.xs,
  },
  strong: {
    fontWeight: Typography.weight.semibold,
    color: Colors.text,
  },
  bullet_list: {
    marginVertical: Spacing.xs,
  },
  list_item: {
    marginVertical: 2,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },
  heroImage: {
    width: '100%',
    height: 240,
  },
  heroPlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.base,
  },
  title: {
    fontSize: Typography.size.xxl,
    fontWeight: Typography.weight.bold,
    color: Colors.text,
    letterSpacing: -0.5,
    lineHeight: Typography.size.xxl * 1.2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.base,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaLabel: {
    fontSize: Typography.size.xs,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.text,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.base,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    gap: Spacing.sm,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  notesTitle: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: Typography.size.base,
    color: Colors.text,
    lineHeight: Typography.size.base * 1.5,
  },
});
