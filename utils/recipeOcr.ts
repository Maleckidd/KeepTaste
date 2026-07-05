// Thin native wrapper around @react-native-ml-kit/text-recognition (SPEC.md
// §5.15 mode T3, "From photo (OCR)"). The pure assembly of blocks into text
// lives in utils/ocrText.ts. This module must NEVER throw at import time — in
// Expo Go, on web, or under Jest the native module is absent, so we guard the
// require and expose `isOcrAvailable` for callers to gate the UI.
import { NativeModules, Platform } from 'react-native';
import { ocrBlocksToText, type OcrBlock } from './ocrText';

// Shape we consume from the library's recognize() result. Kept minimal so the
// mapping to OcrBlock is obvious (see index.ts: TextRecognitionResult).
type MlkitLine = { text: string };
type MlkitBlock = {
  text: string;
  lines?: MlkitLine[];
  frame?: { top: number; left?: number; width?: number; height?: number };
};
type MlkitResult = { text: string; blocks: MlkitBlock[] };
type TextRecognitionModule = {
  recognize: (imageUrl: string) => Promise<MlkitResult>;
};

let mlkit: TextRecognitionModule | null = null;
// A successful require does not prove the native side is linked: on Expo Go /
// web the JS ships but NativeModules.TextRecognition is null, and the library
// returns a Proxy that throws on use. Gate on the native module being present.
if (Platform.OS !== 'web' && NativeModules.TextRecognition != null) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mlkit = require('@react-native-ml-kit/text-recognition').default;
  } catch {
    mlkit = null;
  }
}

/** True only when the ML Kit native module is actually linked (dev/prod build). */
export const isOcrAvailable: boolean = mlkit != null;

/**
 * Runs on-device OCR over the image at `uri` and returns the assembled,
 * top-to-bottom recognized text. Throws when the native module is unavailable
 * (callers should gate on `isOcrAvailable`).
 */
export async function recognizeRecipeText(uri: string): Promise<string> {
  if (!mlkit) {
    throw new Error('OCR is not available in this build.');
  }
  const result = await mlkit.recognize(uri);
  const blocks: OcrBlock[] = (result.blocks ?? []).map((b) => ({
    text: b.text,
    lines: b.lines?.map((l) => ({ text: l.text })),
    frame: b.frame,
  }));
  return ocrBlocksToText(blocks);
}
