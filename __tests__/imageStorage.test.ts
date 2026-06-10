import {
  isInsideDocumentDirectory,
  extractExtension,
  generateImageFilename,
  shouldCopyImage,
  shouldDeleteOldImage,
  targetUri,
} from '../utils/imageStorage';

const DOC_DIR = 'file:///data/user/0/app/files/';
const CACHE_URI = 'file:///data/user/0/app/cache/ImagePicker/abc.jpg';
const INSIDE_URI = 'file:///data/user/0/app/files/recipe-123.jpg';

describe('isInsideDocumentDirectory', () => {
  it('is true when the uri starts with the document directory', () => {
    expect(isInsideDocumentDirectory(INSIDE_URI, DOC_DIR)).toBe(true);
  });

  it('is false for a picker-cache uri outside the document directory', () => {
    expect(isInsideDocumentDirectory(CACHE_URI, DOC_DIR)).toBe(false);
  });

  it('is false when the document directory is null (web)', () => {
    expect(isInsideDocumentDirectory(INSIDE_URI, null)).toBe(false);
  });

  it('is false for an empty uri', () => {
    expect(isInsideDocumentDirectory('', DOC_DIR)).toBe(false);
  });
});

describe('extractExtension', () => {
  it('preserves .jpg', () => {
    expect(extractExtension('file:///x.jpg')).toBe('.jpg');
  });

  it('preserves .jpeg', () => {
    expect(extractExtension('file:///x.jpeg')).toBe('.jpeg');
  });

  it('preserves .png', () => {
    expect(extractExtension('file:///x.png')).toBe('.png');
  });

  it('preserves an uppercase extension as-is', () => {
    expect(extractExtension('file:///x.PNG')).toBe('.PNG');
  });

  it('strips a querystring: file://x.jpg?foo -> .jpg', () => {
    expect(extractExtension('file:///x.jpg?foo')).toBe('.jpg');
  });

  it('strips a hash: file://x.png#bar -> .png', () => {
    expect(extractExtension('file:///x.png#bar')).toBe('.png');
  });

  it('falls back to .jpg when there is no extension', () => {
    expect(extractExtension('file:///x')).toBe('.jpg');
  });
});

describe('generateImageFilename', () => {
  it('is deterministic with injected now and rand', () => {
    expect(generateImageFilename('.jpg', 1000, 0.5)).toBe(
      generateImageFilename('.jpg', 1000, 0.5)
    );
  });

  it('preserves the given extension at the end', () => {
    expect(generateImageFilename('.png', 1000, 0.5).endsWith('.png')).toBe(true);
  });

  it('produces different names for a different now', () => {
    expect(generateImageFilename('.jpg', 1000, 0.5)).not.toBe(
      generateImageFilename('.jpg', 2000, 0.5)
    );
  });

  it('produces different names for a different rand', () => {
    expect(generateImageFilename('.jpg', 1000, 0.5)).not.toBe(
      generateImageFilename('.jpg', 1000, 0.9)
    );
  });
});

describe('shouldCopyImage', () => {
  it('is true for a cache uri with a valid document directory', () => {
    expect(shouldCopyImage(CACHE_URI, DOC_DIR)).toBe(true);
  });

  it('is false when the uri is already inside the document directory', () => {
    expect(shouldCopyImage(INSIDE_URI, DOC_DIR)).toBe(false);
  });

  it('is false for an empty uri', () => {
    expect(shouldCopyImage('', DOC_DIR)).toBe(false);
  });

  it('is false for a null uri', () => {
    expect(shouldCopyImage(null, DOC_DIR)).toBe(false);
  });

  it('is false when the document directory is null (web)', () => {
    expect(shouldCopyImage(CACHE_URI, null)).toBe(false);
  });
});

describe('shouldDeleteOldImage', () => {
  it('is false when old and new are the same uri', () => {
    expect(shouldDeleteOldImage(INSIDE_URI, INSIDE_URI, DOC_DIR)).toBe(false);
  });

  it('is false when the old uri is empty', () => {
    expect(shouldDeleteOldImage('', INSIDE_URI, DOC_DIR)).toBe(false);
  });

  it('is false when the old uri is null', () => {
    expect(shouldDeleteOldImage(null, INSIDE_URI, DOC_DIR)).toBe(false);
  });

  it('is false when the old uri is outside the document directory', () => {
    expect(shouldDeleteOldImage(CACHE_URI, INSIDE_URI, DOC_DIR)).toBe(false);
  });

  it('is true when the old uri is inside and the new path differs', () => {
    const newInside = 'file:///data/user/0/app/files/recipe-999.jpg';
    expect(shouldDeleteOldImage(INSIDE_URI, newInside, DOC_DIR)).toBe(true);
  });

  it('is true when the old uri is inside and the new uri is null (image removed)', () => {
    expect(shouldDeleteOldImage(INSIDE_URI, null, DOC_DIR)).toBe(true);
  });

  it('is true when the old uri is inside and the new uri is empty (image removed)', () => {
    expect(shouldDeleteOldImage(INSIDE_URI, '', DOC_DIR)).toBe(true);
  });
});

describe('targetUri', () => {
  it('joins a trailing-slash directory and filename without doubling the slash', () => {
    expect(targetUri(DOC_DIR, 'recipe-123.jpg')).toBe(
      'file:///data/user/0/app/files/recipe-123.jpg'
    );
  });
});
