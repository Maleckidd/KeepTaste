// The only way the app renders recipe Markdown. It is
// react-native-markdown-display with one rule replaced: images.
//
// Recipe text comes from pastes, imported web pages and other people's
// backups. The library's default image rule loads any http(s) URL, so
// `![x](https://somewhere/pixel.png)` in a recipe would make a request each
// time the recipe is shown: a tracking pixel, and a network call the app
// otherwise never makes (SECURITY.md, threat model). Here an image renders as
// its alt text and nothing is fetched. The app's own photos are not Markdown;
// they live in the recipe's image field.
//
// ESLint (no-restricted-imports in eslint.config.js) keeps every other file
// from importing the renderer directly.
import React from 'react';
import { Text } from 'react-native';
// eslint-disable-next-line no-restricted-imports -- this wrapper is the one allowed importer
import Markdown, { type MarkdownProps, type RenderRules } from 'react-native-markdown-display';

const NO_REMOTE_IMAGES: RenderRules = {
  image: (node, _children, _parents, styles) =>
    node.content ? (
      <Text key={node.key} style={styles.text}>
        {node.content}
      </Text>
    ) : null,
};

export default function RecipeMarkdown({
  rules,
  children,
  ...props
}: React.PropsWithChildren<MarkdownProps>) {
  return (
    <Markdown {...props} rules={{ ...rules, ...NO_REMOTE_IMAGES }}>
      {children}
    </Markdown>
  );
}
