// Tests for cooking timers, stage 1 (SPEC.md §5.21) — step numbers and
// chip keys derived from the react-native-markdown-display AST.
//
// Module under test: utils/timerMarkdown.ts
//   stepNumberFromAncestors(ancestors): number | null
//   chipSourceKey(node, ancestors, matchStart): string
// `ancestors` is the `parent` array a markdown-display render rule receives:
// ancestors[0] is the immediate parent, the last entry is `body`.
// Pure: no react-native / expo imports. Chains below are synthetic.
import {
  stepNumberFromAncestors,
  chipSourceKey,
} from '../utils/timerMarkdown';
import type { MdNode } from '../utils/timerMarkdown';

const node = (
  type: string,
  index: number,
  children: MdNode[] = [],
  attributes: Record<string, unknown> = {}
): MdNode => ({ type, index, attributes, children });

/** Builds ancestors for a text node inside `para` (textgroup ← para ← ...rest). */
function chain(...outerToInner: MdNode[]): MdNode[] {
  return [node('textgroup', 0), ...outerToInner.slice().reverse()];
}

describe('stepNumberFromAncestors — ordered lists', () => {
  function orderedChain(itemIndex: number, attributes: Record<string, unknown> = {}) {
    const para = node('paragraph', 0);
    const item = node('list_item', itemIndex, [para]);
    const list = node('ordered_list', 0, [item], attributes);
    const body = node('body', 0, [list]);
    return chain(body, list, item, para);
  }

  it('uses the 1-based item position when the list has no start', () => {
    expect(stepNumberFromAncestors(orderedChain(2))).toBe(3);
  });

  it('offsets by a numeric start attribute', () => {
    expect(stepNumberFromAncestors(orderedChain(2, { start: 5 }))).toBe(7);
  });

  it('offsets by a string start attribute', () => {
    expect(stepNumberFromAncestors(orderedChain(2, { start: '5' }))).toBe(7);
  });

  it('a bullet item nested in an ordered item takes the ordered step', () => {
    const para = node('paragraph', 0);
    const innerItem = node('list_item', 0, [para]);
    const bullets = node('bullet_list', 1, [innerItem]);
    const outerItem = node('list_item', 1, [node('paragraph', 0), bullets]);
    const ordered = node('ordered_list', 0, [node('list_item', 0), outerItem]);
    const body = node('body', 0, [ordered]);
    expect(
      stepNumberFromAncestors(chain(body, ordered, outerItem, bullets, innerItem, para))
    ).toBe(2);
  });

  it('the outermost ordered list wins over a nested ordered list', () => {
    const para = node('paragraph', 0);
    const innerItem = node('list_item', 3, [para]);
    const innerList = node('ordered_list', 1, [innerItem]);
    const outerItem = node('list_item', 0, [node('paragraph', 0), innerList]);
    const outerList = node('ordered_list', 0, [outerItem]);
    const body = node('body', 0, [outerList]);
    expect(
      stepNumberFromAncestors(chain(body, outerList, outerItem, innerList, innerItem, para))
    ).toBe(1);
  });

  it('a bullet list alone has no step', () => {
    const para = node('paragraph', 0);
    const item = node('list_item', 2, [para]);
    const list = node('bullet_list', 0, [item]);
    const body = node('body', 0, [list]);
    expect(stepNumberFromAncestors(chain(body, list, item, para))).toBeNull();
  });
});

describe('stepNumberFromAncestors — top-level paragraphs', () => {
  it('numbers a paragraph by its position among top-level paragraphs', () => {
    const heading = node('heading1', 0);
    const p1 = node('paragraph', 1);
    const p2 = node('paragraph', 2);
    const body = node('body', 0, [heading, p1, p2]);
    expect(stepNumberFromAncestors(chain(body, p2))).toBe(2);
    expect(stepNumberFromAncestors(chain(body, p1))).toBe(1);
  });

  it('a single top-level paragraph has no step', () => {
    const p = node('paragraph', 0);
    const body = node('body', 0, [p]);
    expect(stepNumberFromAncestors(chain(body, p))).toBeNull();
  });

  it('paragraphs next to a top-level ordered list have no step', () => {
    const list = node('ordered_list', 0, [node('list_item', 0)]);
    const p = node('paragraph', 1);
    const p2 = node('paragraph', 2);
    const body = node('body', 0, [list, p, p2]);
    expect(stepNumberFromAncestors(chain(body, p))).toBeNull();
  });

  it('text inside a heading has no step', () => {
    const p1 = node('paragraph', 0);
    const heading = node('heading2', 1);
    const p2 = node('paragraph', 2);
    const body = node('body', 0, [p1, heading, p2]);
    expect(stepNumberFromAncestors(chain(body, heading))).toBeNull();
  });
});

describe('chipSourceKey', () => {
  function setup(opts: { textIndex?: number; paraIndex?: number; itemIndex?: number } = {}) {
    const { textIndex = 0, paraIndex = 0, itemIndex = 1 } = opts;
    const text = node('text', textIndex);
    const para = node('paragraph', paraIndex, [text]);
    const item = node('list_item', itemIndex, [para]);
    const list = node('ordered_list', 0, [item]);
    const body = node('body', 0, [list]);
    return { text, ancestors: chain(body, list, item, para) };
  }

  it('returns a non-empty string', () => {
    const { text, ancestors } = setup();
    const key = chipSourceKey(text, ancestors, 4);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('is deterministic for equal input', () => {
    const a = setup();
    const b = setup();
    expect(chipSourceKey(a.text, a.ancestors, 4)).toBe(
      chipSourceKey(b.text, b.ancestors, 4)
    );
  });

  it('differs when the match offset differs', () => {
    const { text, ancestors } = setup();
    expect(chipSourceKey(text, ancestors, 4)).not.toBe(
      chipSourceKey(text, ancestors, 12)
    );
  });

  it('differs when the text node index differs', () => {
    const a = setup({ textIndex: 0 });
    const b = setup({ textIndex: 2 });
    expect(chipSourceKey(a.text, a.ancestors, 4)).not.toBe(
      chipSourceKey(b.text, b.ancestors, 4)
    );
  });

  it('differs when any ancestor index differs', () => {
    const base = setup();
    const baseKey = chipSourceKey(base.text, base.ancestors, 4);
    const otherItem = setup({ itemIndex: 2 });
    const otherPara = setup({ paraIndex: 1 });
    expect(chipSourceKey(otherItem.text, otherItem.ancestors, 4)).not.toBe(baseKey);
    expect(chipSourceKey(otherPara.text, otherPara.ancestors, 4)).not.toBe(baseKey);
  });
});
