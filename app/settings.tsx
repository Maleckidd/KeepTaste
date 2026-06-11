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
import { importBackup } from '@/db/import';
import {
  parseBackupMarkdown,
  type BackupSection,
} from '@/utils/importMarkdown';
import { exportAllData } from '@/utils/backupExport';
import { deleteStoredImage } from '@/utils/imageStorage';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
  Shadow,
} from '@/constants/theme';
import { useT, useLanguage } from '@/i18n/LanguageProvider';
import { pluralPl } from '@/utils/i18n';

export default function SettingsScreen() {
  const router = useRouter();
  const c = useTheme();
  const t = useT();
  const { preference, setPreference } = useLanguage();
  const styles = useMemo(() => makeStyles(c), [c]);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const languageSubtitle =
    preference === 'en'
      ? t('settings.languageEnglish')
      : preference === 'pl'
        ? t('settings.languagePolish')
        : t('settings.languageSystem');

  const handleLanguagePress = () => {
    Alert.alert(t('settings.chooseLanguage'), undefined, [
      {
        text: t('settings.languageSystem'),
        onPress: () => setPreference('system'),
      },
      {
        text: t('settings.languageEnglish'),
        onPress: () => setPreference('en'),
      },
      {
        text: t('settings.languagePolish'),
        onPress: () => setPreference('pl'),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const performDelete = async () => {
    const paths = await deleteAllData();
    await Promise.all(paths.map(deleteStoredImage));
    router.back();
  };

  const confirmDeleteFinal = () => {
    Alert.alert(
      t('settings.deleteFinalTitle'),
      t('settings.deleteFinalMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteEverything'),
          style: 'destructive',
          onPress: performDelete,
        },
      ]
    );
  };

  const pluralSuffix = (n: number) => {
    const cat = pluralPl(n);
    return cat === 'one' ? 'One' : cat === 'few' ? 'Few' : 'Many';
  };

  const cookbooksFragment = (count: number) =>
    t(`settings.backupCookbooksAcc${pluralSuffix(count)}` as const, { count });

  const importBackupCompleteMessage = (cookbooks: number, recipes: number) =>
    t('settings.importBackupComplete', {
      cookbooks: cookbooksFragment(cookbooks),
      recipes: t(`settings.backupRecipesAcc${pluralSuffix(recipes)}` as const, {
        count: recipes,
      }),
    });

  const importBackupConfirmMessage = (cookbooks: number, recipes: number) =>
    t('settings.importBackupConfirm', {
      cookbooks: cookbooksFragment(cookbooks),
      recipes: t(
        `settings.backupRecipesInstr${pluralSuffix(recipes)}` as const,
        { count: recipes }
      ),
    });

  const runImport = async (sections: BackupSection[]) => {
    try {
      const { cookbooks, recipes } = await importBackup(sections);
      Alert.alert(
        t('settings.importCompleteTitle'),
        importBackupCompleteMessage(cookbooks, recipes)
      );
      router.back();
    } catch {
      Alert.alert(
        t('settings.importFailedTitle'),
        t('settings.importFailedSaving')
      );
    }
  };

  const handleExportAll = async () => {
    try {
      await exportAllData(t('settings.exportAllDialogTitle'));
    } catch {
      Alert.alert(
        t('settings.exportFailedTitle'),
        t('settings.exportFailedMessage')
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
      Alert.alert(t('settings.importFailedTitle'), t('settings.importFailedRead'));
      return;
    }

    const result = parseBackupMarkdown(content);
    if (!result.ok) {
      Alert.alert(t('settings.importFailedTitle'), result.error);
      return;
    }

    const cookbookCount = result.sections.filter(
      (s) => s.cookbookName !== null
    ).length;
    const recipeCount = result.sections.reduce(
      (sum, s) => sum + s.recipes.length,
      0
    );

    Alert.alert(
      t('settings.importBackupConfirmTitle'),
      importBackupConfirmMessage(cookbookCount, recipeCount),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.importAction'),
          onPress: () => runImport(result.sections),
        },
      ]
    );
  };

  const handleDeleteAll = () => {
    Alert.alert(
      t('settings.deleteAllTitle'),
      t('settings.deleteAllMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
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
          {t('settings.title')}
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
          <Text style={styles.appVersion}>
            {t('settings.version', { version: appVersion })}
          </Text>
        </View>

        {/* Language */}
        <Text style={styles.sectionLabel}>{t('settings.language')}</Text>
        <TouchableOpacity
          style={styles.languageRow}
          onPress={handleLanguagePress}
          activeOpacity={0.8}
        >
          <Ionicons name="language-outline" size={18} color={c.textSecondary} />
          <View style={styles.languageTextWrap}>
            <Text style={styles.languageLabel}>{t('settings.language')}</Text>
            <Text style={styles.languageValue}>{languageSubtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </TouchableOpacity>

        {/* Your data notice */}
        <Text style={styles.sectionLabel}>{t('settings.yourData')}</Text>
        <View style={styles.card}>
          <View style={styles.noticeRow}>
            <Ionicons
              name="phone-portrait-outline"
              size={18}
              color={c.textSecondary}
            />
            <Text style={styles.noticeText}>{t('settings.noticeLocal')}</Text>
          </View>
          <View style={styles.noticeRow}>
            <Ionicons
              name="trash-outline"
              size={18}
              color={c.textSecondary}
            />
            <Text style={styles.noticeText}>{t('settings.noticeUninstall')}</Text>
          </View>
          <View style={styles.noticeRow}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={c.textSecondary}
            />
            <Text style={styles.noticeText}>{t('settings.noticeExport')}</Text>
          </View>
        </View>

        {/* Export all data */}
        <TouchableOpacity
          style={styles.importButton}
          onPress={handleExportAll}
          activeOpacity={0.8}
        >
          <Ionicons name="share-outline" size={18} color={c.text} />
          <Text style={styles.importButtonText}>{t('settings.exportAll')}</Text>
        </TouchableOpacity>
        <Text style={styles.importHint}>{t('settings.exportAllHint')}</Text>

        {/* Import */}
        <TouchableOpacity
          style={styles.importButton}
          onPress={handleImport}
          activeOpacity={0.8}
        >
          <Ionicons name="download-outline" size={18} color={c.text} />
          <Text style={styles.importButtonText}>{t('settings.import')}</Text>
        </TouchableOpacity>
        <Text style={styles.importHint}>{t('settings.importHint')}</Text>

        {/* Delete all data */}
        <Text style={styles.sectionLabel}>{t('settings.dangerZone')}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAll}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color={c.surface} />
          <Text style={styles.deleteButtonText}>{t('settings.deleteAll')}</Text>
        </TouchableOpacity>
        <Text style={styles.deleteHint}>{t('settings.deleteHint')}</Text>
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
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: c.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: Spacing.base,
  },
  languageTextWrap: {
    flex: 1,
    gap: 2,
  },
  languageLabel: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  languageValue: {
    fontSize: Typography.size.sm,
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
