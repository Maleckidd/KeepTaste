// Step numbers and stable chip keys for cooking-timer chips (SPEC.md §5.21),
// derived from the react-native-markdown-display AST that a render rule
// receives. Pure: no react-native / expo imports.
//
// `ancestors` is the rule's `parent` array: ancestors[0] is the immediate
// parent, the last entry is the synthetic `body` root.

export type MdNode = {
  type: string;
  index?: number;
  attributes?: Record<string, unknown>;
  children?: MdNode[];
};

function listStart(list: MdNode): number {
  const raw = list.attributes?.start;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 1;
}

/**
 * The step a piece of Instructions text belongs to:
 * - inside an ordered list → the displayed number of the item in the
 *   OUTERMOST ordered list (honours `start`);
 * - a top-level paragraph → its position among top-level paragraphs, but only
 *   when there are at least two and no top-level ordered list;
 * - anything else (bullets, headings, a single paragraph) → null.
 */
export function stepNumberFromAncestors(ancestors: MdNode[]): number | null {
  // Walk outermost → innermost so the first ordered list found is the outermost.
  for (let i = ancestors.length - 1; i > 0; i--) {
    const node = ancestors[i];
    if (node.type !== 'ordered_list') continue;
    const item = ancestors[i - 1];
    if (item.type !== 'list_item') return null;
    return listStart(node) + (item.index ?? 0);
  }

  const body = ancestors[ancestors.length - 1];
  const top = ancestors[ancestors.length - 2];
  if (!body || body.type !== 'body' || !top || top.type !== 'paragraph') return null;
  const siblings = body.children ?? [];
  if (siblings.some((n) => n.type === 'ordered_list')) return null;
  const paragraphs = siblings.filter((n) => n.type === 'paragraph');
  if (paragraphs.length < 2) return null;
  let pos = paragraphs.indexOf(top);
  if (pos < 0) pos = paragraphs.findIndex((n) => n.index === top.index);
  return pos < 0 ? null : pos + 1;
}

/**
 * Identifies one duration chip within the Instructions: the AST index path
 * (body → … → text node) plus the match offset inside the text node. Stable
 * across re-renders of unchanged Instructions; editing them may re-key chips
 * (a running timer then simply no longer shows on a chip).
 */
export function chipSourceKey(
  node: MdNode,
  ancestors: MdNode[],
  matchStart: number
): string {
  const path = ancestors
    .slice()
    .reverse()
    .map((n) => (n.index === undefined ? '_' : String(n.index)));
  path.push(node.index === undefined ? '_' : String(node.index));
  return `${path.join('.')}@${matchStart}`;
}
