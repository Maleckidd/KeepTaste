// Renders the Play Store feature graphic (1024x500) — the banner Play uses when
// it promotes the app, and the image that sits above the listing when there is
// a promo video.
//
// It deliberately reuses the screenshot frames' palette and type scale
// (scripts/lib/brand.ts) so the listing reads as one set, and it shows a real
// captured screen rather than placeholder cards.
//
// Two constraints drive the layout:
//   - Play may overlay a video play button over the middle of the graphic, so
//     the centre stays clear: wordmark left, device right.
//   - It is displayed small — often around 380px wide. Nothing here is under
//     24px at 1024 wide, which survives that reduction; the old asset's 14px
//     feature row did not.
//
// Run from the repo root:
//   npx --yes tsx scripts/build-feature-graphic.ts        # both languages
//   npx --yes tsx scripts/build-feature-graphic.ts pl     # one language
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
import { LANGS, PHONE_CAPTURE, ROOT, paths, requireCapture } from './lib/config';
import { dataUri, findChromium, renderHtml } from './lib/render';

const OUT = path.join(paths.play, 'feature');

const WIDTH = 1024;
const HEIGHT = 500;

/** Which captured screen goes in the frame, by screen id (see lib/config.ts). */
const CAPTURE_SCREEN = '03-recipe-list';

type Copy = {
  tagline: string;
  /** Three short proof points, joined with middots. */
  points: string[];
};

const COPY: Record<string, Copy> = {
  en: {
    tagline: 'Your recipes. Offline. Always.',
    points: ['No account', 'No cloud', 'No ads'],
  },
  pl: {
    tagline: 'Twoje przepisy. Offline. Zawsze.',
    points: ['Bez konta', 'Bez chmury', 'Bez reklam'],
  },
};

function html(copy: Copy, capture: string): string {
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
  /* Brick rules top and bottom, carried over from the previous graphic — they
     give the banner an edge on the white Play card behind it. */
  .edge { position: absolute; left: 0; right: 0; height: 7px; background: ${Palette.primary}; }
  .edge.top { top: 0; }
  .edge.bottom { bottom: 0; }

  .copy { position: absolute; left: 76px; top: 50%; transform: translateY(-50%); }
  .wordmark {
    font-size: 84px;
    font-weight: 700;
    letter-spacing: -0.035em;
    color: ${Palette.ink};
    line-height: 1;
  }
  .wordmark span { color: ${Palette.primary}; }
  .rule { margin-top: 26px; width: 300px; height: 5px; border-radius: 3px; background: ${Palette.primary}; }
  .tagline {
    margin-top: 24px;
    font-size: 30px;
    font-weight: 500;
    letter-spacing: -0.01em;
    color: ${Palette.body};
  }
  .points {
    margin-top: 20px;
    font-size: 25px;
    font-weight: 400;
    color: ${Palette.faint};
  }
  .points b { color: ${Palette.primary}; font-weight: 400; padding: 0 10px; }

  /* The device bleeds off the top and bottom edges: at this canvas height a
     whole phone would be too small to read as an app screen. */
  .device {
    position: absolute;
    right: 96px;
    top: 34px;
    width: 306px;
    height: 632px;
    overflow: hidden;
    ${deviceFrame({
      radius: 34,
      contact: { y: 2, blur: 8, alpha: 0.08 },
      cast: { y: 26, blur: 60, alpha: 0.26 },
      borderAlpha: 0.1,
    })}
  }
  /* Pull the status bar out of view — the frame shows app, not system UI. */
  .device img { display: block; width: 100%; margin-top: -${Math.round(
    (306 / PHONE_CAPTURE.width) * PHONE_CAPTURE.statusBarRows
  )}px; }
</style></head>
<body>
  <div class="edge top"></div>
  <div class="copy">
    <div class="wordmark">Keep<span>Taste</span></div>
    <div class="rule"></div>
    <div class="tagline">${escapeHtml(copy.tagline)}</div>
    <div class="points">${copy.points.map(escapeHtml).join('<b>·</b>')}</div>
  </div>
  <div class="device"><img src="${capture}"></div>
  <div class="edge bottom"></div>
</body></html>`;
}

function main(): void {
  const { langs } = parseSelectors(process.argv.slice(2), {
    langs: { label: 'language', values: LANGS },
  });
  const chromium = findChromium();

  for (const lang of langs) {
    const copy = COPY[lang];
    const capture = requireCapture(lang, CAPTURE_SCREEN);
    const out = path.join(OUT, `feature-graphic-${lang}.png`);
    renderHtml({
      chromium,
      html: html(copy, dataUri(capture)),
      width: WIDTH,
      height: HEIGHT,
      out,
    });
    console.log(`  ${path.relative(ROOT, out)}`);
  }
}

main();
