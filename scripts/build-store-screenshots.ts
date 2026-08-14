// Composes the Play Store screenshot sets: takes the raw device captures under
// assets/app/ and renders each one into a marketing frame — brand-warm
// background, a headline from assets/store/screenshot-captions.json, and the
// capture in a rounded device frame.
//
// Play has three separate slots on the listing, and this produces all of them:
//
//   form      canvas      source captures            Play slot
//   phone     1080x1920   assets/app/<lang>/         Phone
//   tablet7   1200x1920   assets/app/tablet/<lang>/  7-inch tablet
//   tablet10  1600x2560   assets/app/tablet/<lang>/  10-inch tablet
//
// The two tablet slots share one set of tablet captures: a 7" and a 10" device
// run the same layout at the same 800dp width, so the difference is canvas size
// (and the type that scales with it), not app UI. What must *not* happen is
// pushing phone captures into a tablet slot — the frame would be a scaled-up
// phone, which is exactly what the tablet slots exist to rule out.
//
// Rendering is plain headless Chromium (the copy of Chrome for Testing that
// Playwright already caches) pointed at a generated HTML file, so there is no
// image-processing dependency to install. Output is JPEG via sips (macOS).
//
// Run from the repo root:
//   npx --yes tsx scripts/build-store-screenshots.ts               # everything
//   npx --yes tsx scripts/build-store-screenshots.ts pl            # one language
//   npx --yes tsx scripts/build-store-screenshots.ts pl tablet10   # one of each
//
// Capture procedure for the raw inputs: docs/store-screenshots.md
import * as fs from 'fs';
import * as path from 'path';
import {
  Palette,
  FONT,
  canvasCss,
  deviceFrame,
  escapeHtml,
  warmBackground,
} from './lib/brand';
import { parseSelectors } from './lib/cli';
import {
  LANGS,
  PHONE_CAPTURE,
  TABLET_CAPTURE,
  capture,
  paths,
} from './lib/config';
import { dataUri, findChromium, renderHtml } from './lib/render';

const OUT = paths.play;

type Form = {
  /** Output canvas — the dimensions Play receives. */
  width: number;
  height: number;
  /** Which set of captures to read: phone, or the shared tablet set. */
  captures: 'phone' | 'tablet';
  /** Raw capture dimensions, used to work out the crops in canvas pixels. */
  rawWidth: number;
  rawHeight: number;
  /** Rows to crop off the raw capture: the status bar and (tablet) taskbar. */
  cropTop: number;
  cropBottom: number;
  /** Device frame width as a fraction of the canvas. */
  frame: number;
};

const FORMS: Record<string, Form> = {
  // Phone: 1080x2400 capture, 9:16 canvas. The frame is taller than the space
  // left under the headline, so it bleeds off the bottom edge on purpose — which
  // also means the gesture bar never comes into view and needs no crop.
  phone: {
    width: 1080,
    height: 1920,
    captures: 'phone',
    rawWidth: PHONE_CAPTURE.width,
    rawHeight: PHONE_CAPTURE.height,
    cropTop: PHONE_CAPTURE.statusBarRows,
    cropBottom: 0,
    frame: 0.806,
  },
  // Tablet: 1600x2560 capture at 800dp. Crops the system taskbar as well as the
  // status bar — it is launcher UI, not the app.
  tablet7: {
    width: 1200,
    height: 1920,
    captures: 'tablet',
    rawWidth: TABLET_CAPTURE.width,
    rawHeight: TABLET_CAPTURE.height,
    cropTop: TABLET_CAPTURE.statusBarRows,
    cropBottom: TABLET_CAPTURE.bottomBarRows,
    frame: 0.93,
  },
  tablet10: {
    width: 1600,
    height: 2560,
    captures: 'tablet',
    rawWidth: TABLET_CAPTURE.width,
    rawHeight: TABLET_CAPTURE.height,
    cropTop: TABLET_CAPTURE.statusBarRows,
    cropBottom: TABLET_CAPTURE.bottomBarRows,
    frame: 0.93,
  },
};

type Copy = { headline: string; subline: string };
/**
 * `align: "bottom"` anchors the capture to the *bottom* of the device frame
 * instead of the top. The frame is shorter than the capture, so by default the
 * bottom rows are the ones clipped — which hides anything that lives at the
 * bottom of the screen. A bottom sheet (the import sheet) is exactly that, and
 * no amount of scrolling moves it into the top of the shot.
 */
type Screen = { file: string; align?: 'top' | 'bottom' } & Record<string, Copy>;

function html(
  form: Form,
  copy: Copy,
  imageDataUri: string,
  align: 'top' | 'bottom' = 'top'
): string {
  const { width: W, height: H } = form;
  const frameW = Math.round(W * form.frame);
  // Everything below is expressed against the canvas width so the same layout
  // holds at 1080, 1200 and 1600 wide.
  const u = (fraction: number): number => Math.round(W * fraction);
  const scale = frameW / form.rawWidth;
  const cropTop = Math.round(form.cropTop * scale);
  const cropBottom = Math.round(form.cropBottom * scale);
  // Top-anchored: pull the status bar up out of view and let the bottom clip.
  // Bottom-anchored: pin the capture's bottom edge (less the cropped taskbar
  // rows) to the frame's bottom edge, so the top is what gets clipped instead.
  const imgPosition =
    align === 'bottom'
      ? `position: absolute; left: 0; bottom: -${cropBottom}px;`
      : `margin-top: -${cropTop}px;`;
  // The frame takes whatever height is left under the headline and clips the
  // capture there, so it bleeds off the bottom edge. That is what keeps a
  // half-empty screen (a cookbook with three recipes, a short shopping list)
  // from rendering as a slab of blank app background.

  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${canvasCss(W, H)}
  body {
    font-family: ${FONT};
    ${warmBackground({
      primary: { size: '120% 70%', at: '78% -8%', alpha: 0.2, fade: 62 },
      ember: { size: '90% 55%', at: '8% 104%', alpha: 0.16, fade: 60 },
      tilt: 168,
      mid: 52,
    })}
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .headline {
    margin-top: ${u(0.107)}px;
    max-width: ${u(0.85)}px;
    text-align: center;
    font-size: ${u(0.0667)}px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.025em;
    color: ${Palette.ink};
    white-space: pre-line;
  }
  .subline {
    margin-top: ${u(0.024)}px;
    max-width: ${u(0.76)}px;
    text-align: center;
    font-size: ${u(0.0306)}px;
    line-height: 1.35;
    font-weight: 400;
    letter-spacing: -0.005em;
    color: ${Palette.muted};
  }
  .rule {
    margin-top: ${u(0.031)}px;
    width: ${u(0.085)}px;
    height: ${u(0.0056)}px;
    border-radius: ${u(0.003)}px;
    background: ${Palette.primary};
    opacity: 0.9;
  }
  .device {
    margin-top: ${u(0.054)}px;
    width: ${frameW}px;
    flex: 1 1 auto;
    min-height: 0;
    /* Never taller than the capture minus its cropped rows, so the system
       taskbar at the bottom of a tablet capture can never come into view. */
    max-height: ${Math.round(
      (form.rawHeight - form.cropTop - form.cropBottom) * scale
    )}px;
    overflow: hidden;
    position: relative;
    ${deviceFrame({
      radius: u(0.0426),
      contact: { y: 2, blur: 6, alpha: 0.06 },
      cast: { y: u(0.031), blur: u(0.065), alpha: 0.2 },
    })}
  }
  .device img { display: block; width: 100%; ${imgPosition} }
</style></head>
<body>
  <div class="headline">${escapeHtml(copy.headline)}</div>
  <div class="subline">${escapeHtml(copy.subline)}</div>
  <div class="rule"></div>
  <div class="device"><img src="${imageDataUri}"></div>
</body></html>`;
}

function main(): void {
  const { langs, forms } = parseSelectors(process.argv.slice(2), {
    langs: { label: 'language', values: LANGS },
    forms: { label: 'form', values: Object.keys(FORMS) },
  });

  const captions = JSON.parse(fs.readFileSync(paths.captions, 'utf8')) as {
    screens: Screen[];
  };
  const chromium = findChromium();
  let written = 0;

  for (const formName of forms) {
    const form = FORMS[formName];
    for (const lang of langs) {
      const outDir = path.join(OUT, formName, lang);
      fs.mkdirSync(outDir, { recursive: true });

      for (const screen of captions.screens) {
        const copy = screen[lang] as Copy | undefined;
        if (!copy) throw new Error(`no "${lang}" copy for ${screen.file}`);
        const src = capture(lang, screen.file, form.captures);
        if (!fs.existsSync(src)) {
          throw new Error(
            `missing capture ${src} — see docs/store-screenshots.md`
          );
        }
        const align = screen.align as 'top' | 'bottom' | undefined;
        renderHtml({
          chromium,
          html: html(form, copy, dataUri(src), align),
          width: form.width,
          height: form.height,
          out: path.join(outDir, `${screen.file}.jpg`),
        });
        console.log(`  ${formName}/${lang}/${screen.file}.jpg`);
        written++;
      }
    }
  }
  console.log(`Wrote ${written} frames to ${OUT}`);
}

main();
