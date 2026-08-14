// The KeepTaste marketing look, in one place.
//
// Three different things are rendered against it — the Play screenshot frames,
// the feature graphic and the promo video's scene backgrounds — and the whole
// point is that a visitor to the listing reads them as one set. When the palette
// lived in each script separately, they drifted: the frames and the banner ended
// up on visibly different creams.
//
// The tokens are fixed; the *geometry* is not. A 1024x500 banner and a 1600x2560
// screenshot need the same colours placed differently, so the gradient helpers
// take their positions as arguments and only the colours are shared. These are
// marketing tokens, deliberately separate from the app's own design tokens in
// constants/theme.ts — the store look is warmer than the app's surfaces.

export const Palette = {
  /** Brand primary — the brick red. Also constants/theme.ts `primary`. */
  primary: '#C84B31',
  /** Secondary warm accent, used only as a background glow. */
  ember: '#8A6C2C',
  /** Headline ink. */
  ink: '#1A1714',
  /** Body copy on a light background. */
  body: '#4A443E',
  /** Sublines under a headline. */
  muted: '#6B6560',
  /** The faintest legible grey — proof points on the feature graphic. */
  faint: '#756C65',
  /** App background, showing inside an empty device frame. */
  surface: '#FAFAF7',
  /** The cream wash, light to deep. */
  cream: ['#FFFBF7', '#F8F0E8', '#F1E3D8'],
} as const;

/** rgb() triples for the colours that are used at partial opacity. */
const RGB = {
  primary: '200, 75, 49',
  ember: '138, 108, 44',
  ink: '26, 23, 20',
  /** Shadows are warm, not neutral grey — they sit on cream. */
  shadow: '60, 30, 20',
} as const;

/**
 * System UI stack. There is no bundled webfont: these render through headless
 * Chrome on macOS, where this resolves to SF Pro, and a store asset is not worth
 * an embedded font dependency.
 */
export const FONT = `-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;

/** A radial colour wash: how big, where, how strong, and where it fades out. */
export type Glow = {
  /** CSS radial-gradient size, e.g. `120% 70%`. */
  size: string;
  /** CSS position, e.g. `78% -8%`. Off-canvas values are normal here. */
  at: string;
  /** Peak opacity at the centre. */
  alpha: number;
  /** Percentage at which it reaches full transparency. */
  fade: number;
};

export type BackgroundOptions = {
  /** Brick glow, conventionally top-right. */
  primary: Glow;
  /** Olive glow, conventionally bottom-left. */
  ember: Glow;
  /** Angle of the cream wash under both glows. */
  tilt: number;
  /** Where the middle cream stop sits, in percent. */
  mid: number;
};

/**
 * The warm background every store asset sits on: two soft brand glows over a
 * three-stop cream wash.
 *
 * Returns the `background:` declaration, to be dropped into a rule.
 */
export function warmBackground(o: BackgroundOptions): string {
  const glow = (g: Glow, rgb: string): string =>
    `radial-gradient(${g.size} at ${g.at}, rgba(${rgb}, ${g.alpha}) 0%, rgba(${rgb}, 0) ${g.fade}%)`;
  const [c0, c1, c2] = Palette.cream;
  return `background:
      ${glow(o.primary, RGB.primary)},
      ${glow(o.ember, RGB.ember)},
      linear-gradient(${o.tilt}deg, ${c0} 0%, ${c1} ${o.mid}%, ${c2} 100%);`;
}

/** One drop shadow layer: how far down, how soft, how dark. */
export type Shadow = { y: number; blur: number; alpha: number };

export type DeviceFrameOptions = {
  /** Corner radius in canvas pixels. */
  radius: number;
  /** Tight shadow that pins the frame to the background. */
  contact: Shadow;
  /** Long shadow that lifts it off the page. */
  cast: Shadow;
  /** Hairline border opacity. Heavier on small canvases, where it is the only
   *  thing separating a light app screen from a light background. */
  borderAlpha?: number;
};

/**
 * The rounded frame a screen capture is drawn into: app-surface fill, hairline
 * border and a two-layer shadow.
 *
 * Returns declarations only — position and size stay with the caller, because
 * each canvas places the frame differently (and the video also needs the same
 * radius as an ffmpeg alpha mask).
 */
export function deviceFrame(o: DeviceFrameOptions): string {
  const layer = (s: Shadow): string =>
    `0 ${s.y}px ${s.blur}px rgba(${RGB.shadow}, ${s.alpha})`;
  return `border-radius: ${o.radius}px;
    background: ${Palette.surface};
    border: 1px solid rgba(${RGB.ink}, ${o.borderAlpha ?? 0.08});
    box-shadow: ${layer(o.contact)}, ${layer(o.cast)};`;
}

/** Reset plus a canvas locked to exactly width x height, so the shot is exact. */
export function canvasCss(width: number, height: number): string {
  return `* { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }`;
}

/** Copy from the JSON storyboards goes into markup — escape it. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
