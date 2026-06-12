import React, { forwardRef } from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';
import { useTheme, Typography, Spacing, Radius } from '@/constants/theme';

type Props = TextInputProps & {
  /** Larger emphasized variant (titles, list names). */
  large?: boolean;
};

// Base text input — surface background, themed border and placeholder color.
const Input = forwardRef<TextInput, Props>(function Input(
  { large = false, style, multiline, ...rest },
  ref
) {
  const c = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={c.textMuted}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : undefined}
      style={[
        styles.base,
        {
          backgroundColor: c.surface,
          borderColor: c.border,
          color: c.text,
        },
        large && styles.large,
        multiline && styles.multiline,
        style,
      ]}
      {...rest}
    />
  );
});

export default Input;

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.size.base,
    minHeight: 44,
  },
  large: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.medium,
    paddingVertical: Spacing.md,
  },
  multiline: {
    minHeight: 120,
    paddingTop: Spacing.md,
    lineHeight: Typography.size.base * 1.6,
  },
});
