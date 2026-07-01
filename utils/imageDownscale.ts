// Downscales picked photos before they're stored (SPEC.md §5.17 / storage).
// Phone photos are 8–12 Mpix (3–5 MB each); a recipe card/header never needs
// that, and full-res originals are what bloat the .zip backup and push the
// single-base64-string export toward OOM (docs/backup-freeze-rootcause.md).
// We cap the longer edge and re-encode as JPEG. Pure math lives in resizeToFit
// (unit-tested); the native re-encode is a thin best-effort wrapper.
import * as ImageManipulator from 'expo-image-manipulator';

/** Long-edge cap (px) for stored photos; cards/headers never need more. */
export const MAX_IMAGE_DIMENSION = 1280;
/** JPEG quality (0–1) for re-encoded photos. */
export const IMAGE_JPEG_QUALITY = 0.7;

/**
 * Pure: the resize action that caps the longer edge at `max` while keeping the
 * aspect ratio. expo-image-manipulator scales the other edge proportionally
 * when only one dimension is given, so we constrain whichever edge is longer.
 * Returns null when the image already fits, or when dimensions are
 * unknown/invalid — in that case the caller only re-compresses, never upscales.
 */
export function resizeToFit(
  width: number | undefined,
  height: number | undefined,
  max: number = MAX_IMAGE_DIMENSION
): { width: number } | { height: number } | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= max) return null;
  return width >= height ? { width: max } : { height: max };
}

/**
 * Best-effort downscale + JPEG re-encode of a freshly picked photo. Returns a
 * new cache uri, or the original uri on any failure — a failed shrink must never
 * lose the user's image.
 */
export async function downscaleForStorage(
  uri: string,
  width?: number,
  height?: number
): Promise<string> {
  try {
    const resize = resizeToFit(width, height);
    const actions = resize ? [{ resize }] : [];
    const result = await ImageManipulator.manipulateAsync(uri, actions, {
      compress: IMAGE_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    return uri;
  }
}
