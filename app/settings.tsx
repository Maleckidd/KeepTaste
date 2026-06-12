import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '@/components/ui/ScreenHeader';
import Button from '@/components/ui/Button';
import ActionSheet from '@/components/ui/ActionSheet';
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
  const [languageMenuOpen, setLanguageMenuOpen] = React.useState(false);

  const languageSubtitle =
    preference === 'en'
      ? t('settings.languageEnglish')
      : preference === 'pl'
        ? t('settings.languagePolish')
        : t('settings.languageSystem');

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
      <ScreenHeader title={t('settings.title')} back />

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
        <Pressable
          style={({ pressed }) => [
            styles.languageRow,
            pressed && { backgroundColor: c.surfaceAlt },
          ]}
          onPress={() => setLanguageMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.language')}: ${languageSubtitle}`}
        >
          <Ionicons name="language-outline" size={18} color={c.textSecondary} />
          <View style={styles.languageTextWrap}>
            <Text style={styles.languageLabel}>{t('settings.language')}</Text>
            <Text style={styles.languageValue}>{languageSubtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </Pressable>

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
        <Button
          variant="secondary"
          icon="share-outline"
          label={t('settings.exportAll')}
          onPress={handleExportAll}
          style={styles.actionButton}
        />
        <Text style={styles.importHint}>{t('settings.exportAllHint')}</Text>

        {/* Import */}
        <Button
          variant="secondary"
          icon="download-outline"
          label={t('settings.import')}
          onPress={handleImport}
          style={styles.actionButton}
        />
        <Text style={styles.importHint}>{t('settings.importHint')}</Text>

        {/* Delete all data */}
        <Text style={styles.sectionLabel}>{t('settings.dangerZone')}</Text>
        <Button
          variant="destructive"
          icon="trash-outline"
          label={t('settings.deleteAll')}
          onPress={handleDeleteAll}
        />
        <Text style={styles.deleteHint}>{t('settings.deleteHint')}</Text>
      </ScrollView>

      <ActionSheet
        visible={languageMenuOpen}
        title={t('settings.chooseLanguage')}
        onClose={() => setLanguageMenuOpen(false)}
        actions={[
          {
            label: t('settings.languageSystem'),
            icon: 'phone-portrait-outline',
            onPress: () => setPreference('system'),
          },
          {
            label: t('settings.languageEnglish'),
            icon: 'language-outline',
            onPress: () => setPreference('en'),
          },
          {
            label: t('settings.languagePolish'),
            icon: 'language-outline',
            onPress: () => setPreference('pl'),
          },
        ]}
      />
    </View>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
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
  actionButton: {
    marginTop: Spacing.md,
  },
  importHint: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.size.sm * 1.4,
  },
  deleteHint: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.size.sm * 1.4,
  },
});
