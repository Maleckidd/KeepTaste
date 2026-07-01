import { requireNativeModule } from 'expo';

export type SafwriterModule = {
  /**
   * Streams the file at `srcPath` (a plain fs path or file:// URI) into the SAF
   * document URI `destUri` (content://) via ContentResolver.openOutputStream.
   * Bounded native buffer, no base64 — resolves when the copy finishes.
   */
  copyFileToSaf(srcPath: string, destUri: string): Promise<void>;
};

export default requireNativeModule<SafwriterModule>('Safwriter');
