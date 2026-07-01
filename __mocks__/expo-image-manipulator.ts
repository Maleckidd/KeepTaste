// Lightweight manual mock — pure-logic tests load imageDownscale.ts (which
// imports this native module) but only exercise resizeToFit, never the native
// re-encode. manipulateAsync echoes the uri so the wrapper stays a no-op.
export const SaveFormat = { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' } as const;

export async function manipulateAsync(uri: string) {
  return { uri, width: 0, height: 0 };
}
