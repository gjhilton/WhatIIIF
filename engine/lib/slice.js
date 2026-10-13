import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { findMissingTiles } from './validate.js';
import { vips, header, hasProfile } from './vips.js';

const MAX_SIZE_WIDTH = 2000;

/** Converts any supported source to 8-bit, 3-band sRGB so every tile renders the same everywhere. */
async function normalise(source, work) {
  let current = source;
  let step = 0;
  const next = async (...args) => {
    const out = join(work, `norm-${step++}.v`);
    await vips(...args.map((a) => (a === '$in' ? current : a === '$out' ? out : a)));
    current = out;
  };

  // Cameras and phones record rotation as a tag instead of turning the pixels; autorot applies it and resets the tag.
  // (Older libvips reports an untagged image as a missing field, hence the fallback.)
  if ((await header(current, 'orientation').catch(() => '1')) !== '1') await next('autorot', '$in', '$out');
  // An embedded profile (Display P3 from phones, Adobe RGB from scanners) says what the numbers mean. Tiles carry no
  // profile, so the pixels themselves have to become sRGB or the image changes colour as the viewer zooms in.
  if (await hasProfile(current)) await next('icc_transform', '$in', '$out', 'srgb');
  if ((await header(current, 'interpretation')) !== 'srgb') await next('colourspace', '$in', '$out', 'srgb');
  if ((await header(current, 'bands')) === '4') await next('flatten', '$in', '$out', '--background', '255 255 255');
  if ((await header(current, 'format')) !== 'uchar') await next('cast', '$in', '$out', 'uchar');
  return current;
}

/**
 * Slices `source` into a static IIIF Image API 3.0 level 0 service in `outDir`.
 * libvips does the tiling; we then repair what it leaves out (see plan: spike findings).
 */
export async function slice({ source, outDir, id, tileSize = 512, quality = 85, publishFull = true }) {
  const work = await mkdtemp(join(tmpdir(), 'iiif-work-'));
  const tiles = join(work, 'tiles');
  const jpeg = `.jpg[Q=${quality}]`;

  try {
    const image = await normalise(source, work);
    await vips('dzsave', image, tiles, '--layout', 'iiif3', '--tile-size', tileSize, '--overlap', 0, '--suffix', jpeg);

    const info = JSON.parse(await readFile(join(tiles, 'info.json'), 'utf8'));
    info.id = id;
    info.extraFeatures = ['sizeByWh'];
    // Whole-image renditions for thumbnails and previews. Viewers built on OpenSeadragon 4-5 read `sizes` as the
    // pyramid levels, so only real levels may be listed: the smaller ones here, deep zoom covers the rest.
    info.sizes = info.tiles[0].scaleFactors
      .filter((s) => s > 1)
      .map((s) => ({ width: Math.ceil(info.width / s), height: Math.ceil(info.height / s) }))
      .filter(({ width }) => width <= MAX_SIZE_WIDTH)
      .sort((a, b) => a.width - b.width);
    await writeFile(join(tiles, 'info.json'), JSON.stringify(info, null, 2));

    const wanted = new Set(await findMissingTiles(tiles, info));
    if (publishFull) wanted.add('full/max/0/default.jpg');

    const unexpected = [];
    for (const path of wanted) {
      const [region, size] = path.split('/');
      if (region !== 'full') {
        unexpected.push(path);
        continue;
      }
      const target = join(tiles, path);
      await mkdir(dirname(target), { recursive: true });
      if (size === 'max') {
        await vips('copy', image, `${target}[Q=${quality}]`);
      } else {
        const [w, h] = size.split(',');
        await vips('thumbnail', image, `${target}[Q=${quality}]`, w, '--height', h, '--size', 'force');
      }
    }
    if (unexpected.length) {
      throw new Error(`libvips left tiles we do not know how to generate: ${unexpected.slice(0, 5).join(', ')}`);
    }

    await cp(tiles, outDir, { recursive: true });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
