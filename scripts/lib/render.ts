// Shared HTML → image rendering for the store asset scripts
// (build-store-screenshots.ts, build-feature-graphic.ts, build-promo-video.ts —
// which renders its scene backgrounds and its rounded alpha mask this way, then
// hands them to ffmpeg).
//
// Uses the copy of Chrome for Testing that Playwright already caches, so store
// assets can be rebuilt without adding an image-processing dependency to the
// project. JPEG conversion goes through sips, so this is macOS-only — same as
// the rest of the store tooling.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

/** Newest Chrome-for-Testing in the Playwright browser cache. */
export function findChromium(): string {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const builds = fs
    .readdirSync(cache)
    .filter((d) => d.startsWith('chromium-'))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const build of builds) {
    const bin = path.join(
      cache,
      build,
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    );
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error(
    `no Chrome for Testing found under ${cache} — run "npx playwright install chromium"`
  );
}

/** Reads an image off disk as a data: URI, for inlining into the page. */
export function dataUri(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

type RenderOptions = {
  chromium: string;
  html: string;
  width: number;
  height: number;
  /** Destination; `.jpg`/`.jpeg` is converted from the PNG capture via sips. */
  out: string;
  /** JPEG quality, ignored for PNG output. */
  quality?: number;
};

/** Renders an HTML string to a PNG or JPEG of exactly width × height. */
export function renderHtml({
  chromium,
  html,
  width,
  height,
  out,
  quality = 90,
}: RenderOptions): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keeptaste-render-'));
  try {
    const page = path.join(tmp, 'page.html');
    fs.writeFileSync(page, html);
    const jpeg = /\.jpe?g$/i.test(out);
    const png = jpeg ? path.join(tmp, 'shot.png') : out;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.rmSync(png, { force: true });
    try {
      execFileSync(
        chromium,
        [
          '--headless',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          `--screenshot=${png}`,
          `--window-size=${width},${height}`,
          `file://${page}`,
        ],
        { stdio: 'ignore' }
      );
    } catch (e) {
      // Newer Chrome for Testing builds (1255) write the screenshot, then exit
      // with status 2 on "Teardown watchdog expired". Only a missing file is a
      // failed render.
      if (!fs.existsSync(png)) throw e;
    }
    if (jpeg) {
      execFileSync(
        'sips',
        ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), png, '--out', out],
        { stdio: 'ignore' }
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
