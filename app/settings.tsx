import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  Switch,
  Modal,
  ActivityIndicator,
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
import { isDatabaseEmpty } from '@/db/backup';
import { importBackup } from '@/db/import';
import {
  parseBackupMarkdown,
  type BackupSection,
} from '@/utils/importMarkdown';
import {
  exportBackupZip,
  loadBackupZip,
  commitBackupRestore,
  writeBackupToFolder,
  BACKUP_KEYS,
  type LoadedBackup,
} from '@/utils/backupArchiveFs';
import { getSetting, setSetting } from '@/db/settings';
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
  // Non-null while a restore/import is reading or writing — shows a blocking
  // spinner so the user knows the (sometimes slow) file load is in progress.
  const [busyMessage, setBusyMessage] = React.useState<string | null>(null);

  // Automatic backup (§5.17.3) — Android only (Storage Access Framework).
  const supportsAutoBackup = Platform.OS === 'android';
  const [autoEnabled, setAutoEnabled] = React.useState(false);
  const [folderUri, setFolderUri] = React.useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!supportsAutoBackup) return;
    (async () => {
      setAutoEnabled((await getSetting(BACKUP_KEYS.autoEnabled)) === '1');
      setFolderUri(await getSetting(BACKUP_KEYS.folderUri));
      setLastBackupAt(await getSetting(BACKUP_KEYS.lastExportAt));
    })();
  }, [supportsAutoBackup]);

  const pickBackupFolder = async () => {
    const perm =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return;
    await setSetting(BACKUP_KEYS.folderUri, perm.directoryUri);
    await setSetting(BACKUP_KEYS.autoEnabled, '1');
    setFolderUri(perm.directoryUri);
    setAutoEnabled(true);
    // Write a first backup immediately so the user sees it works.
    try {
      const now = new Date().toISOString();
      await writeBackupToFolder(perm.directoryUri);
      await setSetting(BACKUP_KEYS.lastExportAt, now);
      setLastBackupAt(now);
    } catch {
      Alert.alert(
        t('settings.exportFailedTitle'),
        t('settings.exportFailedMessage')
      );
    }
  };

  const toggleAutoBackup = async (value: boolean) => {
    if (value && !folderUri) {
      await pickBackupFolder();
      return;
    }
    await setSetting(BACKUP_KEYS.autoEnabled, value ? '1' : '0');
    setAutoEnabled(value);
  };

  const lastBackupLabel = lastBackupAt
    ? t('settings.autoBackupLast', {
        date: new Date(lastBackupAt).toLocaleDateString(),
      })
    : t('settings.autoBackupNever');

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
    setBusyMessage(t('settings.restoreSaving'));
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
    } finally {
      setBusyMessage(null);
    }
  };

  const handleExportAll = async () => {
    setBusyMessage(t('settings.exportPreparing'));
    try {
      await exportBackupZip(t('settings.exportAllDialogTitle'));
    } catch {
      Alert.alert(
        t('settings.exportFailedTitle'),
        t('settings.exportFailedMessage')
      );
    } finally {
      setBusyMessage(null);
    }
  };

  const runRestore = async (
    loaded: LoadedBackup,
    mode: 'replace' | 'add'
  ) => {
    setBusyMessage(t('settings.restoreSaving'));
    try {
      await commitBackupRestore(loaded, mode);
      Alert.alert(
        mode === 'replace'
          ? t('settings.restoreReplacedTitle')
          : t('settings.restoreAddedTitle'),
        mode === 'replace'
          ? t('settings.restoreReplacedMessage')
          : t('settings.restoreAddedMessage')
      );
      router.back();
    } catch {
      Alert.alert(
        t('settings.importFailedTitle'),
        t('settings.importFailedSaving')
      );
    } finally {
      setBusyMessage(null);
    }
  };

  // .zip path — the complete backup (§5.17). Into an empty library it restores
  // silently 1:1; into a populated one it asks Replace vs Add.
  const handleImportZip = async (uri: string) => {
    // Reading + unzipping can take a moment for large backups — show the spinner
    // until we either restore (runRestore keeps it up) or fall back to an Alert.
    setBusyMessage(t('settings.restoreLoading'));
    let result: Awaited<ReturnType<typeof loadBackupZip>>;
    try {
      result = await loadBackupZip(uri);
    } catch {
      setBusyMessage(null);
      Alert.alert(t('settings.importFailedTitle'), t('settings.importFailedZip'));
      return;
    }
    if (!result.ok) {
      setBusyMessage(null);
      Alert.alert(t('settings.importFailedTitle'), t('settings.importFailedZip'));
      return;
    }
    const { loaded } = result;

    // A zip that fell back to recipes.md (no backup.json) carries no photos or
    // timestamps, so a Replace would lose fidelity — keep it append-only (§5.17).
    if (loaded.fromMarkdown) {
      await runRestore(loaded, 'add');
      return;
    }

    if (await isDatabaseEmpty()) {
      await runRestore(loaded, 'replace');
      return;
    }

    // Need a decision from the user — drop the spinner while the Alert is up.
    setBusyMessage(null);
    Alert.alert(
      t('settings.restoreChooseTitle'),
      t('settings.restoreChooseMessage', {
        recipes: loaded.content.recipes.length,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.restoreAdd'),
          onPress: () => runRestore(loaded, 'add'),
        },
        {
          text: t('settings.restoreReplace'),
          style: 'destructive',
          onPress: () => runRestore(loaded, 'replace'),
        },
      ]
    );
  };

  // Legacy .md path — append-only (it can't be a faithful 1:1 restore).
  const handleImportMarkdown = async (uri: string) => {
    setBusyMessage(t('settings.restoreLoading'));
    let content: string;
    try {
      content = await FileSystem.readAsStringAsync(uri);
    } catch {
      setBusyMessage(null);
      Alert.alert(t('settings.importFailedTitle'), t('settings.importFailedRead'));
      return;
    }

    const result = parseBackupMarkdown(content);
    // Parsing is done — the next step is a confirmation Alert, so hide the spinner.
    setBusyMessage(null);
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

  const handleImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/zip',
        'application/x-zip-compressed',
        'application/octet-stream',
        'text/markdown',
        'text/plain',
      ],
      copyToCacheDirectory: true,
    });

    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;

    const isZip =
      asset.name?.toLowerCase().endsWith('.zip') ||
      asset.mimeType === 'application/zip' ||
      asset.mimeType === 'application/x-zip-compressed';

    if (isZip) {
      await handleImportZip(asset.uri);
    } else {
      await handleImportMarkdown(asset.uri);
    }
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

        {/* Automatic backup (Android / SAF) */}
        {supportsAutoBackup && (
          <>
            <Text style={styles.sectionLabel}>{t('settings.autoBackup')}</Text>
            <View style={styles.card}>
              <View style={styles.autoRow}>
                <Text style={styles.autoLabel}>
                  {t('settings.autoBackupEnable')}
                </Text>
                <Switch value={autoEnabled} onValueChange={toggleAutoBackup} />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.autoRow,
                  pressed && { opacity: 0.6 },
                ]}
                onPress={pickBackupFolder}
                accessibilityRole="button"
                accessibilityLabel={t('settings.autoBackupChooseFolder')}
              >
                <View style={styles.autoTextWrap}>
                  <Text style={styles.autoValue}>
                    {folderUri
                      ? t('settings.autoBackupFolderSet')
                      : t('settings.autoBackupNoFolder')}
                  </Text>
                  <Text style={styles.autoSub}>{lastBackupLabel}</Text>
                </View>
                <Text style={styles.autoAction}>
                  {folderUri
                    ? t('settings.autoBackupChangeFolder')
                    : t('settings.autoBackupChooseFolder')}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.importHint}>{t('settings.autoBackupNote')}</Text>
          </>
        )}

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

      <Modal visible={busyMessage !== null} transparent animationType="fade">
        <View style={styles.busyOverlay}>
          <View style={styles.busyCard}>
            <ActivityIndicator size="large" color={c.primary} />
            <Text style={styles.busyText}>{busyMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  busyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  busyCard: {
    backgroundColor: c.surface,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.base,
    minWidth: 200,
  },
  busyText: {
    fontSize: Typography.size.base,
    color: c.text,
    textAlign: 'center',
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
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  autoLabel: {
    flex: 1,
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: c.text,
  },
  autoTextWrap: {
    flex: 1,
    gap: 2,
  },
  autoValue: {
    fontSize: Typography.size.base,
    color: c.text,
  },
  autoSub: {
    fontSize: Typography.size.sm,
    color: c.textMuted,
  },
  autoAction: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: c.primary,
  },
});
