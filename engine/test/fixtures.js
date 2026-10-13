import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempDir } from './tmp.js';

const run = promisify(execFile);

/** Creates a noisy RGB TIFF of the given size (noise keeps JPEG tiles non-trivial). */
export async function makeImage(width, height) {
  const dir = await tempDir('src');
  const noise = join(dir, 'noise.v');
  const rgb = join(dir, 'rgb.v');
  const out = join(dir, `test-${width}x${height}.tif`);
  await run('vips', ['gaussnoise', noise, String(width), String(height), '--sigma', '40', '--mean', '128']);
  await run('vips', ['bandjoin', `${noise} ${noise} ${noise}`, rgb]);
  await run('vips', ['cast', rgb, out, 'uchar']);
  return out;
}

/** Variants that exercise colour normalisation: 16-bit RGB, CMYK, greyscale, RGBA. */
export async function makeVariant(kind, width = 700, height = 500) {
  const base = await makeImage(width, height);
  const out = base.replace(/\.tif$/, `-${kind}.tif`);
  const steps = {
    rgb16: ['colourspace', base, out, 'rgb16'],
    cmyk: ['colourspace', base, out, 'cmyk'],
    grey: ['colourspace', base, out, 'b-w'],
  };
  if (kind === 'rgba') {
    await run('vips', ['bandjoin_const', base, out, '255']); // not `addalpha`, which libvips 8.15 lacks
  } else {
    await run('vips', steps[kind]);
  }
  return out;
}

/**
 * A 600x400 JPEG, black with a white block in its stored top-left corner, tagged with an
 * EXIF orientation (1-8) the way cameras and phones do instead of rotating the pixels.
 */
export async function makeOriented(orientation) {
  const dir = await tempDir('src');
  const black = join(dir, 'black.v');
  const white = join(dir, 'white.v');
  const plain = join(dir, 'plain.jpg');
  const out = join(dir, `oriented-${orientation}.jpg`);
  await run('vips', ['black', black, '100', '100', '--bands', '3']);
  await run('vips', ['invert', black, white]);
  await run('vips', ['embed', white, plain, '0', '0', '600', '400']);

  // Smallest possible EXIF segment: a little-endian TIFF header and one IFD entry, Orientation (0x0112).
  const exif = Buffer.from([
    ...Buffer.from('Exif\0\0'),
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0,
    1, 0,
    0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  const jpeg = await readFile(plain);
  await writeFile(out, Buffer.concat([jpeg.subarray(0, 2), app1, exif, jpeg.subarray(2)]));
  return out;
}

/**
 * A flat image of the sRGB colour 200,60,40 stored in Display P3 with that profile embedded,
 * as wide-gamut cameras and phones write. The stored numbers are therefore not 200,60,40.
 */
export async function makeWideGamut() {
  const dir = await tempDir('src');
  const black = join(dir, 'black.v');
  const flat = join(dir, 'flat.v');
  const out = join(dir, 'display-p3.tif');
  await run('vips', ['black', black, '700', '500', '--bands', '3']);
  await run('vips', ['linear', black, flat, '1 1 1', '200 60 40', '--uchar']);
  await run('vips', ['icc_transform', flat, out, 'p3', '--input-profile', 'srgb']);
  return out;
}

/** The sRGB colour a colour-managed browser shows at x,y: an embedded profile is applied, none means sRGB. */
export async function displayedPixel(file, x, y) {
  const shown = join(await tempDir('shown'), 'shown.v');
  await run('vips', ['icc_transform', file, shown, 'srgb', '--input-profile', 'srgb']);
  return pixel(shown, x, y);
}

/** The orientation tag a file carries, 1 (upright) when it has none. */
export async function orientationTag(file) {
  const { stdout } = await run('vipsheader', ['-a', file]);
  return Number(stdout.match(/^orientation: (\d)$/m)?.[1] ?? 1);
}

/** Band values of the pixel at x,y. */
export async function pixel(file, x, y) {
  const { stdout } = await run('vips', ['getpoint', file, String(x), String(y)]);
  return stdout.trim().split(/\s+/).map(Number);
}

export { header } from '../lib/vips.js';
