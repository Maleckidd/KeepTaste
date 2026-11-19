// Renders the GitHub social preview (1280x640) — the card shown when a link to
// the repository is shared. Same palette, type and device frame as the Play
// feature graphic (scripts/lib/brand.ts); the copy is the wordmark and a
// one-line tagline.
//
// GitHub has no API for the social preview: upload the output by hand in
// Settings → General → Social preview. GitHub keeps the important content
// inside a 40px border, so nothing sits closer than that to an edge.
//
// Run from the repo root:
//   npx --yes tsx scripts/build-social-preview.ts
import * as path from 'path';
import {
  Palette,
  FONT,
  canvasCss,
  deviceFrame,
  escapeHtml,
  warmBackground,
} from './lib/brand';
import { PHONE_CAPTURE, ROOT, requireCapture } from './lib/config';
import { dataUri, findChromium, renderHtml } from './lib/render';

const OUT = path.join(ROOT, 'assets/github/social-preview.png');

const WIDTH = 1280;
const HEIGHT = 640;

/** The home screen: cookbook covers, cropped so no product labels show. */
const CAPTURE_SCREEN = '01-cookbooks';

const TAGLINE = 'Offline-first recipe manager for Android';

function html(capture: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${canvasCss(WIDTH, HEIGHT)}
  body {
    font-family: ${FONT};
    ${warmBackground({
      primary: { size: '90% 130%', at: '88% 12%', alpha: 0.22, fade: 62 },
      ember: { size: '70% 110%', at: '2% 100%', alpha: 0.16, fade: 60 },
      tilt: 160,
      mid: 55,
    })}
    position: relative;
  }
  .edge { position: absolute; left: 0; right: 0; height: 8px; background: ${Palette.primary}; }
  .edge.top { top: 0; }
  .edge.bottom { bottom: 0; }

  .copy { position: absolute; left: 96px; top: 50%; transform: translateY(-50%); }
  .wordmark {
    font-size: 104px;
    font-weight: 700;
    letter-spacing: -0.035em;
    color: ${Palette.ink};
    line-height: 1;
  }
  .wordmark span { color: ${Palette.primary}; }
  .rule { margin-top: 30px; width: 360px; height: 6px; border-radius: 3px; background: ${Palette.primary}; }
  .tagline {
    margin-top: 28px;
    font-size: 36px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: ${Palette.body};
  }

  .device {
    position: absolute;
    right: 110px;
    top: 48px;
    width: 330px;
    height: 680px;
    overflow: hidden;
    ${deviceFrame({
      radius: 36,
      contact: { y: 2, blur: 8, alpha: 0.08 },
      cast: { y: 26, blur: 60, alpha: 0.26 },
      borderAlpha: 0.1,
    })}
  }
  .device img { display: block; width: 100%; margin-top: -${Math.round(
    (330 / PHONE_CAPTURE.width) * PHONE_CAPTURE.statusBarRows
  )}px; }
</style></head>
<body>
  <div class="edge top"></div>
  <div class="copy">
    <div class="wordmark">Keep<span>Taste</span></div>
    <div class="rule"></div>
    <div class="tagline">${escapeHtml(TAGLINE)}</div>
  </div>
  <div class="device"><img src="${capture}"></div>
  <div class="edge bottom"></div>
</body></html>`;
}

function main(): void {
  renderHtml({
    chromium: findChromium(),
    html: html(dataUri(requireCapture('en', CAPTURE_SCREEN))),
    width: WIDTH,
    height: HEIGHT,
    out: OUT,
  });
  console.log(`  ${path.relative(ROOT, OUT)}`);
}

main();
