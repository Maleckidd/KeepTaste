// Builds the Play Store promo video from the screen takes in
// assets/store/promo/raw/<lang>/ and the storyboard in
// assets/store/promo-script.json.
//
// The result is a 1920x1080 landscape mp4 — Play links the promo video from
// YouTube and shows it above the screenshots, where a portrait video would be
// pillarboxed. Each scene is the warm brand background with a headline on the
// left and the phone recording, in a rounded device frame, on the right; the
// look is deliberately the same as the still store frames from
// build-store-screenshots.ts, so the listing reads as one piece.
//
// Backgrounds and cards are rendered by the same headless Chrome that
// build-store-screenshots.ts uses, so there is no image library to install.
// ffmpeg does the compositing, the crossfades and the audio.
//
// Run from the repo root, after scripts/record-promo-clips.sh:
//   npx --yes tsx scripts/build-promo-video.ts            # en and pl
//   npx --yes tsx scripts/build-promo-video.ts pl         # one language
//   npx --yes tsx scripts/build-promo-video.ts en --music assets/store/promo/music.mp3
//
// Full pipeline, including how the takes are shot: docs/store-promo-video.md
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import {
  Palette,
  FONT,
  canvasCss,
  deviceFrame,
  escapeHtml,
  warmBackground,
} from './lib/brand';
import { parseSelectors, takeOption } from './lib/cli';
import { LANGS, PHONE_CAPTURE, ROOT, paths } from './lib/config';
import { findChromium, renderHtml } from './lib/render';

const RAW = paths.promoRaw;
const OUT = paths.promo;
const STORY = paths.storyboard;
const LOGO = paths.logo;

/** Output canvas. 16:9 — Play's promo slot is landscape. */
const W = 1920;
const H = 1080;
const FPS = 30;
/** Crossfade between scenes. */
const XFADE = 0.5;

/** The phone capture, and the device frame it is drawn into. */
const RAW_W = PHONE_CAPTURE.width;
const RAW_H = PHONE_CAPTURE.height;
/** Rows of status bar cropped off the top, as in build-store-screenshots.ts. */
const CROP_TOP = PHONE_CAPTURE.statusBarRows;
/** And the system gesture bar off the bottom — it is launcher UI, not the app,
 *  and it sits right on top of the last line of the recipe. */
const CROP_BOTTOM = PHONE_CAPTURE.bottomBarRows;
const DEV_H = 960;
/** Even width — x264 wants even dimensions. */
const DEV_W = even(Math.round((DEV_H * RAW_W) / (RAW_H - CROP_TOP - CROP_BOTTOM)));
const DEV_X = 1232;
const DEV_Y = (H - DEV_H) / 2;
const DEV_RADIUS = 34;

function even(n: number): number {
  return n % 2 === 0 ? n : n + 1;
}

type Copy = { headline: string; subline: string };
type Scene = {
  id: string;
  clip?: string;
  in?: number;
  out?: number;
  card?: 'title' | 'end';
  duration?: number;
} & Record<string, Copy | string | number | undefined>;

const BACKGROUND = warmBackground({
  primary: { size: '90% 90%', at: '82% -10%', alpha: 0.2, fade: 60 },
  ember: { size: '70% 80%', at: '4% 108%', alpha: 0.16, fade: 58 },
  tilt: 160,
  mid: 54,
});

/** A scene background: copy on the left, an empty device frame on the right. */
function sceneHtml(copy: Copy): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${canvasCss(W, H)}
  body { font-family: ${FONT}; ${BACKGROUND} }
  .copy {
    position: absolute; left: 150px; top: 0; height: ${H}px; width: ${DEV_X - 260}px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .headline {
    font-size: 92px; line-height: 1.08; font-weight: 700; letter-spacing: -0.03em;
    color: ${Palette.ink}; white-space: pre-line;
  }
  .rule {
    margin-top: 40px; width: 116px; height: 8px; border-radius: 4px;
    background: ${Palette.primary}; opacity: 0.9;
  }
  .subline {
    margin-top: 40px; font-size: 38px; line-height: 1.35; font-weight: 400;
    letter-spacing: -0.005em; color: ${Palette.muted}; white-space: pre-line;
  }
  /* The screen area is filled with the app background and then covered by the
     recording, which is masked to exactly this rectangle. */
  .device {
    position: absolute; left: ${DEV_X}px; top: ${DEV_Y}px;
    width: ${DEV_W}px; height: ${DEV_H}px;
    ${deviceFrame({
      radius: DEV_RADIUS,
      contact: { y: 4, blur: 12, alpha: 0.07 },
      cast: { y: 40, blur: 90, alpha: 0.22 },
    })}
  }
</style></head><body>
  <div class="copy">
    <div class="headline">${escapeHtml(copy.headline)}</div>
    <div class="rule"></div>
    <div class="subline">${escapeHtml(copy.subline)}</div>
  </div>
  <div class="device"></div>
</body></html>`;
}

/** Title and end cards: centred logo and copy, no device. */
function cardHtml(copy: Copy, logoDataUri: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  ${canvasCss(W, H)}
  body {
    font-family: ${FONT}; ${BACKGROUND}
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  img { width: 176px; height: 176px; border-radius: 40px;
        box-shadow: 0 18px 44px rgba(60, 30, 20, 0.20); }
  .headline {
    margin-top: 52px; font-size: 104px; line-height: 1.05; font-weight: 700;
    letter-spacing: -0.035em; color: ${Palette.ink};
  }
  .rule { margin-top: 34px; width: 116px; height: 8px; border-radius: 4px;
          background: ${Palette.primary}; opacity: 0.9; }
  .subline {
    margin-top: 34px; font-size: 40px; line-height: 1.4; font-weight: 400;
    text-align: center; color: ${Palette.muted}; white-space: pre-line;
  }
</style></head><body>
  <img src="${logoDataUri}">
  <div class="headline">${escapeHtml(copy.headline)}</div>
  <div class="rule"></div>
  <div class="subline">${escapeHtml(copy.subline)}</div>
</body></html>`;
}

/** White rounded rectangle on black — ffmpeg's alphamerge reads it as alpha. */
function maskHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${DEV_W}px; height: ${DEV_H}px; background: #000; overflow: hidden; }
  div { width: ${DEV_W}px; height: ${DEV_H}px; border-radius: ${DEV_RADIUS}px; background: #fff; }
</style></head><body><div></div></body></html>`;
}

function shot(
  chromium: string,
  html: string,
  width: number,
  height: number,
  outPng: string
): void {
  renderHtml({ chromium, html, width, height, out: outPng });
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: 'inherit' });
}

/**
 * One scene as its own mp4. Keeping scenes separate means the crossfade chain
 * at the end only has to line up whole files, and a scene that comes out wrong
 * can be inspected on its own.
 */
function buildScene(
  scene: Scene,
  lang: string,
  chromium: string,
  tmp: string,
  logoDataUri: string,
  maskPng: string
): { file: string; duration: number } {
  const copy = scene[lang] as Copy | undefined;
  if (!copy) throw new Error(`no "${lang}" copy for scene ${scene.id}`);

  const bg = path.join(tmp, `bg-${lang}-${scene.id}.png`);
  const out = path.join(tmp, `scene-${lang}-${scene.id}.mp4`);

  if (scene.card) {
    const duration = scene.duration ?? 3;
    shot(chromium, cardHtml(copy, logoDataUri), W, H, bg);
    ffmpeg([
      '-loop', '1', '-t', String(duration), '-i', bg,
      '-r', String(FPS),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p',
      out,
    ]);
    return { file: out, duration };
  }

  const clip = path.join(RAW, lang, `${scene.clip}.webm`);
  if (!fs.existsSync(clip)) {
    throw new Error(
      `missing take ${clip} — run: bash scripts/record-promo-clips.sh ${lang}`
    );
  }
  const start = scene.in ?? 0;
  const duration = (scene.out ?? 0) - start;
  if (!(duration > 0)) {
    throw new Error(`scene ${scene.id} has no positive in/out range`);
  }

  // A take that is shorter than the scene asks for does not fail — ffmpeg just
  // runs out of frames and the shot freezes on its last one, which is easy to
  // miss in a 30-second video. The takes are a second or two longer or shorter
  // every time they are re-recorded, so check.
  const clipLength = Number(
    execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1',
      clip,
    ]).toString().trim()
  );
  if ((scene.out ?? 0) > clipLength) {
    throw new Error(
      `scene ${scene.id} runs to ${scene.out}s but ${lang}/${scene.clip}.webm is ` +
        `only ${clipLength.toFixed(2)}s — re-record, or pull the out point back ` +
        `in assets/store/promo-script.json`
    );
  }

  shot(chromium, sceneHtml(copy), W, H, bg);

  // The takes are variable frame rate at roughly 20 fps (that is as fast as the
  // emulator renders). `fps` resamples to a constant 30 by repeating frames.
  // Motion-compensated interpolation was the other option and looks worse here:
  // it warps small text while it scrolls.
  const filter = [
    `[1:v]trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS,`,
    `fps=${FPS},crop=${RAW_W}:${RAW_H - CROP_TOP - CROP_BOTTOM}:0:${CROP_TOP},`,
    `scale=${DEV_W}:${DEV_H},setsar=1[vid];`,
    `[vid][2:v]alphamerge[vidm];`,
    `[0:v][vidm]overlay=${DEV_X}:${DEV_Y}:format=auto,format=yuv420p[out]`,
  ].join('');

  ffmpeg([
    '-loop', '1', '-t', String(duration), '-i', bg,
    '-i', clip,
    '-i', maskPng,
    '-filter_complex', filter,
    '-map', '[out]',
    '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    out,
  ]);
  return { file: out, duration };
}

/**
 * Where the music should start, in seconds.
 *
 * Encoders routinely leave a fraction of a second of digital silence at the
 * head of an mp3, and starting there spends the fade-in on nothing — the track
 * then arrives late, under a title card that has already gone. So skip whatever
 * silence is actually there rather than assuming a number.
 */
function musicStart(file: string): number {
  // silencedetect reports on stderr, which execFileSync does not hand back.
  const res = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', file, '-af', 'silencedetect=noise=-50dB:d=0.2', '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  // Only a silence that starts at 0 is leading silence; ignore any later ones.
  const lines = (res.stderr ?? '').split('\n');
  const startsAtZero = lines.some((l) => /silence_start:\s*-?0(\.0+)?\s*$/.test(l));
  if (!startsAtZero) return 0;
  const end = lines.map((l) => l.match(/silence_end:\s*([\d.]+)/)).find(Boolean);
  return end ? Number(end[1]) : 0;
}

/** Integrated loudness to land on, and the true-peak ceiling not to cross. */
const TARGET_LUFS = -17;
const PEAK_CEILING_DBTP = -1.5;

/**
 * How much to turn the music excerpt up or down, in dB.
 *
 * A fixed percentage is the wrong control here: it makes the result depend
 * entirely on how hot the dropped-in track happened to be mastered. There is no
 * voiceover to duck under, so the music is the whole soundtrack, and it wants to
 * land at a predictable level — quiet is the failure mode nobody notices until
 * the video is live, because YouTube turns loud audio down but never turns
 * quiet audio up.
 */
function musicGainDb(file: string, from: number, length: number): number {
  const res = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-ss', String(from), '-t', String(length),
     '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  const err = res.stderr ?? '';
  const loudness = err.match(/I:\s*(-?[\d.]+) LUFS/);
  const peak = err.match(/Peak:\s*(-?[\d.]+) dBFS/);
  if (!loudness || !peak) return 0;

  let gain = TARGET_LUFS - Number(loudness[1]);
  const headroom = PEAK_CEILING_DBTP - Number(peak[1]);
  if (gain > headroom) gain = headroom;
  return gain;
}

/** Chain the scenes with crossfades, then lay the music under the result. */
function assemble(
  scenes: { file: string; duration: number }[],
  music: string | undefined,
  musicFrom: number,
  outFile: string
): void {
  const inputs: string[] = [];
  for (const s of scenes) inputs.push('-i', s.file);

  // Each xfade eats XFADE seconds of overlap, so the running length after k
  // transitions is sum(durations so far) - k * XFADE, and the next transition
  // starts XFADE before that.
  const steps: string[] = [];
  let label = '[0:v]';
  let running = scenes[0].duration;
  for (let i = 1; i < scenes.length; i++) {
    const offset = running - XFADE;
    const next = i === scenes.length - 1 ? '[v]' : `[v${i}]`;
    steps.push(
      `${label}[${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}${next}`
    );
    label = next;
    running = running + scenes[i].duration - XFADE;
  }
  const total = running;

  if (music) {
    const trackLength = Number(
      execFileSync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=nw=1:nk=1',
        music,
      ]).toString().trim()
    );
    if (musicFrom + total > trackLength) {
      throw new Error(
        `the music runs out: ${total.toFixed(1)}s needed from ${musicFrom.toFixed(1)}s, ` +
          `but the track is only ${trackLength.toFixed(1)}s`
      );
    }
  }

  const args = [...inputs];
  if (music) args.push('-i', music);

  const filter = [...steps];
  if (music) {
    const musicIndex = scenes.length;
    // Fade the track up at the start and down over the end card, and keep it
    // well under the headline type — nobody watches a store promo for the music.
    const gain = musicGainDb(music, musicFrom, total);
    console.log(
      `  music level: ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB → ${TARGET_LUFS} LUFS`
    );
    filter.push(
      `[${musicIndex}:a]atrim=${musicFrom.toFixed(3)}:${(musicFrom + total).toFixed(3)},` +
        `asetpts=PTS-STARTPTS,` +
        `volume=${gain.toFixed(2)}dB,afade=t=in:st=0:d=1.2,` +
        `afade=t=out:st=${(total - 2).toFixed(3)}:d=2[a]`
    );
  }

  args.push('-filter_complex', filter.join(';'), '-map', '[v]');
  if (music) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-shortest');

  args.push(
    '-r', String(FPS),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outFile
  );
  ffmpeg(args);
}

function main(): void {
  const argv = process.argv.slice(2);

  let music = takeOption(argv, 'music');
  if (music) {
    if (!fs.existsSync(music)) throw new Error(`--music: no such file: ${music}`);
  } else {
    // Drop a track at this path and it gets picked up without a flag.
    const fallback = path.join(OUT, 'music.mp3');
    if (fs.existsSync(fallback)) music = fallback;
  }

  // Start the excerpt somewhere other than the top of the track — for picking a
  // chorus over an intro. Left alone, the build uses the start of the track,
  // minus any leading silence.
  let musicFrom: number | undefined;
  const startOption = takeOption(argv, 'music-start');
  if (startOption !== undefined) {
    musicFrom = Number(startOption);
    if (!Number.isFinite(musicFrom) || musicFrom < 0) {
      throw new Error('--music-start: expected a number of seconds');
    }
  }

  // Flags are out of argv by now, so whatever is left has to be a language.
  const { langs } = parseSelectors(argv, {
    langs: { label: 'language', values: LANGS },
  });

  if (music) {
    if (musicFrom === undefined) musicFrom = musicStart(music);
    console.log(`music: ${path.basename(music)} from ${musicFrom.toFixed(2)}s`);
  }

  const story = JSON.parse(fs.readFileSync(STORY, 'utf8')) as { scenes: Scene[] };
  const chromium = findChromium();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keeptaste-promo-'));
  const logoDataUri = `data:image/png;base64,${fs.readFileSync(LOGO).toString('base64')}`;

  const maskPng = path.join(tmp, 'mask.png');
  shot(chromium, maskHtml(), DEV_W, DEV_H, maskPng);

  fs.mkdirSync(OUT, { recursive: true });

  for (const lang of langs) {
    console.log(`${lang}:`);
    const built = story.scenes.map((scene) => {
      const s = buildScene(scene, lang, chromium, tmp, logoDataUri, maskPng);
      console.log(`  ${scene.id} (${s.duration.toFixed(1)}s)`);
      return s;
    });
    const outFile = path.join(OUT, `keeptaste-promo-${lang}.mp4`);
    assemble(built, music, musicFrom ?? 0, outFile);
    console.log(`  → ${path.relative(ROOT, outFile)}${music ? '' : '  (no music track)'}`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

main();
