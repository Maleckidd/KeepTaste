// Everything the store-asset scripts need to know about *this* project: which
// languages the listing is published in, where the inputs and outputs live, and
// the geometry of the raw device captures.
//
// This is the first file to edit when the pipeline is pointed at a different
// app or a new language is added — the scripts themselves carry layout and
// composition logic, not project facts.
//
// The Android application id is deliberately *not* here: no TypeScript script
// needs it. It lives once, on the bash side, in scripts/lib/adb.sh.
import * as fs from 'fs';
import * as path from 'path';

/** Repo root. Every script in scripts/ is run from there. */
export const ROOT = path.resolve('.');

/** Store listing languages, in the order the scripts iterate them. */
export const LANGS = ['en', 'pl'] as const;
export type Lang = (typeof LANGS)[number];

export const paths = {
  /** Raw device captures — source, tracked in git. */
  captures: path.join(ROOT, 'assets/app'),
  store: path.join(ROOT, 'assets/store'),
  /** Rendered Play frames — build output, git-ignored. */
  play: path.join(ROOT, 'assets/store/play'),
  promo: path.join(ROOT, 'assets/store/promo'),
  /** Raw screen takes for the video — build output, git-ignored. */
  promoRaw: path.join(ROOT, 'assets/store/promo/raw'),
  /** App icon, used on the video's title and end cards. */
  logo: path.join(ROOT, 'assets/store/play-icon-512.png'),
  captions: path.join(ROOT, 'assets/store/screenshot-captions.json'),
  storyboard: path.join(ROOT, 'assets/store/promo-script.json'),
};

/**
 * A raw capture's dimensions, and the rows of *system* UI along its edges.
 *
 * Everything that composites a capture crops these off: they are launcher
 * chrome, not the app, and a stray notification icon in a store screenshot is
 * the kind of thing nobody spots until it is live.
 */
export type CaptureGeometry = {
  width: number;
  height: number;
  /** Status bar at the top. */
  statusBarRows: number;
  /** Gesture bar (phone) or taskbar (tablet) at the bottom. */
  bottomBarRows: number;
};

export const PHONE_CAPTURE: CaptureGeometry = {
  width: 1080,
  height: 2400,
  statusBarRows: 66,
  bottomBarRows: 60,
};

export const TABLET_CAPTURE: CaptureGeometry = {
  width: 1600,
  height: 2560,
  statusBarRows: 64,
  bottomBarRows: 130,
};

/**
 * Path to a raw capture, by screen id — `capture('en', '03-recipe-list')`.
 *
 * Always address captures by id rather than by hand-written filename. The
 * screens are numbered in listing order, so inserting one renumbers everything
 * after it, and a stale literal path only fails when the script is next run —
 * which is months later, right before an upload.
 */
export function capture(
  lang: string,
  screen: string,
  form: 'phone' | 'tablet' = 'phone'
): string {
  const dir = form === 'tablet' ? path.join('tablet', lang) : lang;
  return path.join(paths.captures, dir, `${screen}.jpg`);
}

/** Same, but fails with the capture instructions instead of a missing file. */
export function requireCapture(
  lang: string,
  screen: string,
  form: 'phone' | 'tablet' = 'phone'
): string {
  const file = capture(lang, screen, form);
  if (!fs.existsSync(file)) {
    throw new Error(
      `missing capture ${path.relative(ROOT, file)} — shoot it first, ` +
        `see docs/store-screenshots.md §2`
    );
  }
  return file;
}
