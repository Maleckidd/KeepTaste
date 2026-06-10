import * as FileSystem from 'expo-file-system';

/**
 * True only when the document directory is known (non-null) and the uri is a
 * truthy path that lives under it.
 */
export function isInsideDocumentDirectory(
  uri: string | null,
  documentDirectory: string | null
): boolean {
  if (!documentDirectory) return false;
  if (!uri) return false;
  return uri.startsWith(documentDirectory);
}

/**
 * Returns the file extension including the leading dot, with case preserved.
 * Querystrings and hashes are stripped first. Falls back to '.jpg' when there
 * is no extension.
 */
export function extractExtension(uri: string): string {
  const cleaned = uri.split('?')[0].split('#')[0];
  const lastSlash = cleaned.lastIndexOf('/');
  const basename = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned;
  const dot = basename.lastIndexOf('.');
  if (dot <= 0 || dot === basename.length - 1) return '.jpg';
  return basename.slice(dot);
}

/**
 * Builds a deterministic-when-injected filename ending with the given
 * extension. Both `now` and `rand` are incorporated so the name is unique.
 */
export function generateImageFilename(
  ext: string,
  now: number = Date.now(),
  rand: number = Math.random()
): string {
  const randPart = Math.floor(rand * 1e9);
  return `img-${now}-${randPart}${ext}`;
}

/**
 * True when there is an image to copy and a document directory to copy it into,
 * and the image is not already stored inside that directory.
 */
export function shouldCopyImage(
  uri: string | null,
  documentDirectory: string | null
): boolean {
  if (!uri) return false;
  if (!documentDirectory) return false;
  return !isInsideDocumentDirectory(uri, documentDirectory);
}

/**
 * True when the old image is owned by us (inside the document directory) and is
 * being replaced by a different image or removed entirely.
 */
export function shouldDeleteOldImage(
  oldUri: string | null,
  newUri: string | null,
  documentDirectory: string | null
): boolean {
  if (!oldUri) return false;
  if (oldUri === newUri) return false;
  if (!isInsideDocumentDirectory(oldUri, documentDirectory)) return false;
  return true;
}

/**
 * Joins a document directory and a filename without doubling the slash, whether
 * or not the directory has a trailing slash.
 */
export function targetUri(documentDirectory: string, filename: string): string {
  const base = documentDirectory.endsWith('/')
    ? documentDirectory.slice(0, -1)
    : documentDirectory;
  return `${base}/${filename}`;
}

/**
 * Persists a picked image into the app's document directory and cleans up the
 * previously stored image when it is being replaced or removed.
 *
 * - Copies `newUri` into the document directory when it is an external (picker)
 *   uri; on copy failure it logs and falls back to the original `newUri` so the
 *   old image is never destroyed by a failed copy.
 * - Deletes `oldUri` only after the result is known, and only when the old
 *   image is ours and is actually being replaced/removed.
 *
 * Returns the uri that should be stored in the database.
 */
export async function persistImage(
  newUri: string | null,
  oldUri: string | null
): Promise<string | null> {
  const docDir = FileSystem.documentDirectory;
  let result: string | null = newUri || null;

  if (newUri && shouldCopyImage(newUri, docDir) && docDir) {
    const filename = generateImageFilename(extractExtension(newUri));
    const dest = targetUri(docDir, filename);
    try {
      await FileSystem.copyAsync({ from: newUri, to: dest });
      result = dest;
    } catch (err) {
      console.warn('persistImage: failed to copy image, keeping original uri', err);
      result = newUri;
    }
  }

  if (shouldDeleteOldImage(oldUri, result, docDir) && oldUri) {
    try {
      await FileSystem.deleteAsync(oldUri, { idempotent: true });
    } catch {
      // best-effort cleanup; ignore failures
    }
  }

  return result;
}

/**
 * Best-effort deletion of an image that we own (inside the document directory).
 * No-op for external or empty uris. Swallows errors.
 */
export async function deleteStoredImage(uri: string | null): Promise<void> {
  const docDir = FileSystem.documentDirectory;
  if (!isInsideDocumentDirectory(uri, docDir) || !uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // best-effort cleanup; ignore failures
  }
}
