import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originalUrl } from '../lib/original.js';

const args = { repo: 'gjh/harbour', ref: 'main', path: 'content/harbour.tif' };

test('links Git LFS files through the media host', () => {
  assert.equal(
    originalUrl({ ...args, lfs: true }),
    'https://media.githubusercontent.com/media/gjh/harbour/main/content/harbour.tif',
  );
});

test('links plain git files through the raw host', () => {
  assert.equal(
    originalUrl({ ...args, lfs: false }),
    'https://raw.githubusercontent.com/gjh/harbour/main/content/harbour.tif',
  );
});

test('is undefined outside GitHub, where there is no repo to link to', () => {
  assert.equal(originalUrl({ ...args, repo: undefined, lfs: true }), undefined);
});

test('percent-encodes the file name, so one with spaces or accents still makes a valid URL', () => {
  assert.equal(
    originalUrl({ ...args, path: 'content/Harbour view #2 (café).tif', lfs: false }),
    'https://raw.githubusercontent.com/gjh/harbour/main/content/Harbour%20view%20%232%20(caf%C3%A9).tif',
  );
});
