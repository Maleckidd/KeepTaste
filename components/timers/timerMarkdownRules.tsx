// react-native-markdown-display `text` rule that turns durations in the recipe
// Instructions into TimerChips (SPEC.md §5.21). Pass the result as `rules` to
// the Instructions <Markdown> ONLY — not ingredients, not notes.
//
// markdown-it's text_collapse merges adjacent text tokens, so "20-25 min" is a
// single node; a duration split across a soft line break is not detected
// (accepted false negative).
import React from 'react';
import { Text } from 'react-native';
import type { RenderRules } from 'react-native-markdown-display';
import { splitDurationSegments } from '@/utils/durations';
import { chipSourceKey, stepNumberFromAncestors } from '@/utils/timerMarkdown';
import TimerChip from './TimerChip';

export function makeInstructionRules(opts: {
  recipeId: number;
  title: string;
  fontScale: number;
}): RenderRules {
  return {
    text: (node, _children, parent, styles, inheritedStyles = {}) => {
      const segments = splitDurationSegments(node.content);
      if (!segments.some((s) => s.kind === 'duration')) {
        return (
          <Text key={node.key} style={[inheritedStyles, styles.text]}>
            {node.content}
          </Text>
        );
      }
      const step = stepNumberFromAncestors(parent);
      return (
        <Text key={node.key} style={[inheritedStyles, styles.text]}>
          {segments.map((seg, i) => {
            if (seg.kind === 'text') return seg.text;
            const sourceKey = chipSourceKey(node, parent, seg.start);
            return (
              <TimerChip
                key={`${sourceKey}#${i}`}
                recipeId={opts.recipeId}
                title={opts.title}
                step={step}
                sourceKey={sourceKey}
                text={seg.text}
                seconds={seg.seconds}
                fontScale={opts.fontScale}
              />
            );
          })}
        </Text>
      );
    },
  };
}
