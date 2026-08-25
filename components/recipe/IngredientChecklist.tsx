import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { parseIngredientLines } from '@/utils/ingredients';
import { lightTap } from '@/utils/haptics';
import {
  useTheme,
  ThemePalette,
  Typography,
  Spacing,
  Radius,
} from '@/constants/theme';

type Props = {
  /** Raw ingredients Markdown, as stored on the recipe. */
  text: string;
  /** In-recipe text zoom (§5.4) — 1× … 1.8×. */
  fontScale: number;
  /** Indices (from `parseIngredientLines`) of the ingredients used up so far. */
  checked: ReadonlySet<number>;
  onToggle: (index: number) => void;
};

/**
 * Ingredients rendered as a tap-to-check list for cooking (SPEC.md §5.4): each
 * product line is a checkbox row that strikes through when tapped, `#` grouping
 * labels stay plain headings. The checked state is ephemeral and owned by the
 * recipe screen — nothing is written to the DB.
 */
export default function IngredientChecklist({
  text,
  fontScale,
  checked,
  onToggle,
}: Props) {
  const c = useTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const lines = useMemo(() => parseIngredientLines(text), [text]);
  const itemStyles = useMemo(
    () => makeItemStyles(c, fontScale, false),
    [c, fontScale]
  );
  const itemStylesChecked = useMemo(
    () => makeItemStyles(c, fontScale, true),
    [c, fontScale]
  );

  // Icon tracks the text zoom — the whole point is reading it from a distance.
  const iconSize = Math.round(22 * fontScale);

  return (
    <View>
      {lines.map((line, i) =>
        line.kind === 'heading' ? (
          <Text
            key={`h${i}`}
            accessibilityRole="header"
            style={[
              styles.heading,
              {
                fontSize: Typography.size.lg * fontScale,
                lineHeight: Typography.size.lg * fontScale * 1.3,
                marginTop: i === 0 ? 0 : Spacing.base,
              },
            ]}
          >
            {line.text}
          </Text>
        ) : (
          <Pressable
            key={`i${i}`}
            onPress={() => {
              lightTap();
              onToggle(line.index);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: checked.has(line.index) }}
            // Screen readers get the plain text — inline ** would be spoken.
            accessibilityLabel={line.text.replace(/\*\*/g, '')}
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: c.surfaceAlt },
            ]}
          >
            <Ionicons
              name={checked.has(line.index) ? 'checkbox' : 'square-outline'}
              size={iconSize}
              color={checked.has(line.index) ? c.primary : c.textMuted}
            />
            <View style={styles.rowBody}>
              <Markdown
                style={checked.has(line.index) ? itemStylesChecked : itemStyles}
              >
                {line.text}
              </Markdown>
            </View>
          </Pressable>
        )
      )}
    </View>
  );
}

// One item line, rendered through Markdown so inline **bold** keeps working.
// Block margins are zeroed — the row itself owns the spacing.
const makeItemStyles = (c: ThemePalette, scale: number, checked: boolean) => {
  const reading = Typography.size.reading * scale;
  return {
    body: { marginTop: 0, marginBottom: 0 },
    paragraph: { marginTop: 0, marginBottom: 0 },
    text: {
      fontSize: reading,
      lineHeight: reading * 1.4,
      color: checked ? c.textMuted : c.text,
      ...(checked ? { textDecorationLine: 'line-through' as const } : null),
    },
    strong: { fontWeight: Typography.weight.bold },
  };
};

const makeStyles = (c: ThemePalette) => StyleSheet.create({
  heading: {
    fontWeight: Typography.weight.bold,
    color: c.text,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.sm,
  },
  rowBody: {
    flex: 1,
  },
});
