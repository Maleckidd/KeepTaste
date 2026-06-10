import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { deleteAllData } from '@/db/recipes';
import { importCookbook } from '@/db/import';
import { parseCookbookMarkdown, type ImportedRecipe } from '@/utils/importMarkdown';
import { deleteStoredImage } from '@/utils/imageStorage';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const performDelete = async () => {
    const paths = await deleteAllData();
    await Promise.all(paths.map(deleteStoredImage));
    router.back();
  };

  const confirmDeleteFinal = () => {
    Alert.alert(
      'This cannot be undone',
      'All cookbooks and recipes will be permanently erased from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: performDelete,
        },
      ]
    );
  };

  const runImport = async (cookbookName: string, recipes: ImportedRecipe[]) => {
    try {
      const { recipeCount } = await importCookbook({ cookbookName, recipes });
      Alert.alert(
        'Import complete',
        `Imported "${cookbookName}" with ${recipeCount} ${
          recipeCount === 1 ? 'recipe' : 'recipes'
        }.`
      );
      router.back();
    } catch {
      Alert.alert(
        'Import failed',
        'Something went wrong while saving. The cookbook may have been imported partially.'
      );
    }
  };

  const handleImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/markdown', 'text/plain'],
      copyToCacheDirectory: true,
    });

    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;

    let content: string;
    try {
      content = await FileSystem.readAsStringAsync(asset.uri);
    } catch {
      Alert.alert('Import failed', 'Could not read the selected file.');
      return;
    }

    const result = parseCookbookMarkdown(content);
    if (!result.ok) {
      Alert.alert('Import failed', result.error);
      return;
    }

    const count = result.recipes.length;
    Alert.alert(
      'Import cookbook?',
      `Import "${result.cookbookName}" with ${count} ${
        count === 1 ? 'recipe' : 'recipes'
      }?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => runImport(result.cookbookName, result.recipes),
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete all data?',
      'This will remove every cookbook, recipe and shopping list stored on this device, along with their images.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDeleteFinal,
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={c.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          Settings
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* App info */}
        <View style={styles.card}>
          <Text style={styles.appName}>KeepTaste</Text>
          <Text style={styles.appVersion}>Version {appVersion}</Text>
        </View>

        {/* Your data notice */}
        <Text style={styles.sectionLabel}>Your data</Text>
        <View style={styles.card}>
          <View style={styles.noticeRow}>
            <Ionicons
              name="phone-portrait-outline"
              size={18}
              color={c.textSecondary}
            />
            <Text style={styles.noticeText}>
              Your recipes are stored only on this device. There are no accounts
              and no cloud sync.
            </Text>
          </View>
          <View style={styles.noticeRow}>
            <Ionicons
              name="trash-outline"
              size={18}
              color={c.textSecondary}
            />
            <Text style={styles.noticeText}>
              Uninstalling the app deletes all of your recipes.
            </Text>
          </View>
          <View style={styles.noticeRow}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={c.textSecondary}
            />
            <Text style={styles.noticeText}>
              Exporting a cookbook to Markdown is the only way to back up your
              recipes.
            </Text>
          </View>
        </View>

        {/* Import */}
        <TouchableOpacity
          style={styles.importButton}
          onPress={handleImport}
          activeOpacity={0.8}
        >
          <Ionicons name="download-outline" size={18} color={c.text} />
          <Text style={styles.importButtonText}>Import from Markdown</Text>
        </TouchableOpacity>
        <Text style={styles.importHint}>
          Adds a new cookbook from a previously exported Markdown file.
        </Text>

        {/* Delete all data */}
        <Text style={styles.sectionLabel}>Danger zone</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAll}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color={c.surface} />
          <Text style={styles.deleteButtonText}>Delete all data</Text>
        </TouchableOpacity>
        <Text style={styles.deleteHint}>
          Permanently erases every cookbook, recipe and shopping list on this device.
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
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
    width: 30,
  },
  title: {
    flex: 1,
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: c.text,
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  sectionLabel: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  appName: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: c.text,
  },
  appVersion: {
    fontSize: Typography.size.base,
    color: c.textMuted,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: Typography.size.base,
    color: c.textSecondary,
    lineHeight: Typography.size.base * 1.5,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    paddingVertical: Spacing.base,
    marginTop: Spacing.md,
  },
  importButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  importHint: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.size.sm * 1.4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: c.error,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    ...Shadow.sm,
  },
  deleteButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.surface,
  },
  deleteHint: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.size.sm * 1.4,
  },
});
