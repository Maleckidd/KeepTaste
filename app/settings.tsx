import React from 'react';
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
import { deleteAllData } from '@/db/recipes';
import { deleteStoredImage } from '@/utils/imageStorage';
import { Colors, Typography, Spacing, Radius, Shadow } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();
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

  const handleDeleteAll = () => {
    Alert.alert(
      'Delete all data?',
      'This will remove every cookbook and recipe stored on this device, along with their images.',
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
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
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
              color={Colors.textSecondary}
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
              color={Colors.textSecondary}
            />
            <Text style={styles.noticeText}>
              Uninstalling the app deletes all of your recipes.
            </Text>
          </View>
          <View style={styles.noticeRow}>
            <Ionicons
              name="document-text-outline"
              size={18}
              color={Colors.textSecondary}
            />
            <Text style={styles.noticeText}>
              Exporting a cookbook to Markdown is the only way to back up your
              recipes.
            </Text>
          </View>
        </View>

        {/* Delete all data */}
        <Text style={styles.sectionLabel}>Danger zone</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDeleteAll}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.surface} />
          <Text style={styles.deleteButtonText}>Delete all data</Text>
        </TouchableOpacity>
        <Text style={styles.deleteHint}>
          Permanently erases every cookbook and recipe on this device.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.text,
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxxl,
  },
  sectionLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  appName: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.text,
  },
  appVersion: {
    fontSize: Typography.size.base,
    color: Colors.textMuted,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  noticeText: {
    flex: 1,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: Typography.size.base * 1.5,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    ...Shadow.sm,
  },
  deleteButtonText: {
    fontSize: Typography.size.base,
    fontWeight: Typography.weight.semibold,
    color: Colors.surface,
  },
  deleteHint: {
    fontSize: Typography.size.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.size.sm * 1.4,
  },
});
