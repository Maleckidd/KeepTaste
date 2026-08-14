// Argument parsing shared by the store-asset build scripts.
//
// They all take the same shape of command line: bare words that *narrow* the
// build ("just Polish", "just the 10-inch tablet"), plus the occasional
// `--flag value`. Narrowing to nothing means building everything, so a plain
// `npx tsx scripts/<script>.ts` always produces the full set.

/** One family of bare selector words, e.g. languages or output forms. */
export type Selector = {
  /** Used in the error message: "expected a <label> (...)" */
  label: string;
  values: readonly string[];
};

/**
 * Sorts bare arguments into their selector groups.
 *
 * A group nobody selected comes back holding *all* of its values, so callers
 * can iterate the result directly. Anything that matches no group is an error:
 * silently ignoring a typo'd language means shipping a listing that is missing
 * half its frames, and the script would have exited 0.
 */
export function parseSelectors<K extends string>(
  argv: string[],
  groups: Record<K, Selector>
): Record<K, string[]> {
  const out = {} as Record<K, string[]>;
  const keys = Object.keys(groups) as K[];
  const matched = new Set<string>();

  for (const key of keys) {
    const { values } = groups[key];
    const picked = argv.filter((a) => values.includes(a));
    picked.forEach((a) => matched.add(a));
    out[key] = picked.length ? picked : [...values];
  }

  const unknown = argv.filter((a) => !matched.has(a));
  if (unknown.length) {
    const expected = keys
      .map((k) => `a ${groups[k].label} (${groups[k].values.join(', ')})`)
      .join(' and/or ');
    throw new Error(
      `unknown argument(s): ${unknown.join(', ')} — expected ${expected}`
    );
  }
  return out;
}

/**
 * Pulls `--name <value>` out of `argv` and returns the value.
 *
 * Mutates `argv` so whatever is left can be handed to `parseSelectors` as bare
 * selectors.
 */
export function takeOption(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  argv.splice(i, 2);
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`--${name}: expected a value`);
  }
  return value;
}
