import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slice, scaleFactors } from '../lib/slice.js';
import { validate } from '../lib/validate.js';
import { makeImage } from './fixtures.js';
import { tempDir } from './tmp.js';

// Awkward sizes: prime-ish, exact tile multiple, single tile, 1 pixel, extreme aspect ratio.
const sizes = [[4999, 3001], [1024, 1024], [300, 200], [1, 1], [2000, 37], [513, 513]];

for (const [w, h] of sizes) {
  test(`slices a ${w}x${h} image into a service viewers can fully load`, async () => {
    const source = await makeImage(w, h);
    const out = await tempDir('out');
    await slice({ source, outDir: out, id: 'https://example.org/iiif/img', tileSize: 512 });

    assert.deepEqual(await validate(out), []);
    const info = JSON.parse(await readFile(join(out, 'info.json'), 'utf8'));
    assert.equal(info.id, 'https://example.org/iiif/img');
    assert.equal(info.width, w);
    assert.equal(info.height, h);
  });
}

// libvips 8.15 (Ubuntu 24.04) lists one level fewer than 8.18, so the depth of the pyramid is ours to define.
const pyramids = [
  [4999, 3001, [1, 2, 4, 8, 16]],
  [400, 600, [1, 2]],
  [1024, 1024, [1, 2]],
  [2000, 37, [1, 2, 4]],
  [512, 512, [1]],
  [1, 1, [1]],
];

for (const [width, height, factors] of pyramids) {
  test(`a ${width}x${height} image is halved until it fits one 512-pixel tile: scale factors ${factors.join(', ')}`, () => {
    assert.deepEqual(scaleFactors({ width, height, tileSize: 512 }), factors);
  });
}
