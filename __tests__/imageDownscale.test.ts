import { resizeToFit, MAX_IMAGE_DIMENSION } from '../utils/imageDownscale';

describe('resizeToFit', () => {
  it('caps a landscape photo by its width (the longer edge)', () => {
    expect(resizeToFit(4000, 3000, 1280)).toEqual({ width: 1280 });
  });

  it('caps a portrait photo by its height (the longer edge)', () => {
    expect(resizeToFit(3000, 4000, 1280)).toEqual({ height: 1280 });
  });

  it('caps a square photo by width (ties go to width)', () => {
    expect(resizeToFit(2000, 2000, 1280)).toEqual({ width: 1280 });
  });

  it('returns null when the image already fits — never upscale', () => {
    expect(resizeToFit(800, 600, 1280)).toBeNull();
    expect(resizeToFit(1280, 1000, 1280)).toBeNull();
  });

  it('returns null for unknown or invalid dimensions', () => {
    expect(resizeToFit(undefined, undefined)).toBeNull();
    expect(resizeToFit(0, 0)).toBeNull();
    expect(resizeToFit(-100, 200)).toBeNull();
  });

  it('defaults to the configured cap', () => {
    expect(resizeToFit(5000, 4000)).toEqual({ width: MAX_IMAGE_DIMENSION });
  });
});
