import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, copyFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { build } from '../lib/build.js';
import { validate } from '../lib/validate.js';
import { makeImage } from './fixtures.js';
import { tempDir } from './tmp.js';

async function setup(toml = '') {
  const content = await tempDir('content');
  const out = await tempDir('dist');
  const siteConfig = join(await tempDir('gen'), 'site.json');
  const image = await makeImage(2000, 1500);
  await copyFile(image, join(content, 'harbour.tif'));
  if (toml) await writeFile(join(content, 'whatiiif.toml'), toml);
  return { content, out, siteConfig };
}
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));

test('builds a valid service, manifest and site config from a committed image', async () => {
  const { content, out, siteConfig } = await setup('title = "Harbour"\nattribution = "Museum"');
  await build({
    contentDir: content,
    outDir: out,
    siteConfigPath: siteConfig,
    env: { SITE_BASE_URL: 'https://example.org/site', GITHUB_REPOSITORY: 'gjh/harbour', GITHUB_REF_NAME: 'main' },
  });

  const imageDir = join(out, 'iiif/image');
  assert.deepEqual(await validate(imageDir), []);
  assert.equal((await read(join(imageDir, 'info.json'))).id, 'https://example.org/site/iiif/image');

  const manifest = await read(join(out, 'iiif/manifest.json'));
  assert.equal(manifest.id, 'https://example.org/site/iiif/manifest.json');
  assert.deepEqual(manifest.label, { en: ['Harbour'] });
  assert.match(manifest.rendering[0].id, /raw\.githubusercontent\.com\/gjh\/harbour\/main\/content\/harbour\.tif/);

  const site = await read(siteConfig);
  assert.equal(site.viewer, 'openseadragon');
  assert.equal(site.manifestUrl, 'https://example.org/site/iiif/manifest.json');
  assert.equal(site.infoUrl, 'https://example.org/site/iiif/image/info.json');
  assert.equal(site.title, 'Harbour');
  assert.equal(site.width, 2000);
});

test('base_url in the config overrides the derived Pages URL', async () => {
  const { content, out, siteConfig } = await setup('base_url = "https://iiif.example.com/"');
  await build({ contentDir: content, outDir: out, siteConfigPath: siteConfig, env: { SITE_BASE_URL: 'https://example.org/site' } });
  assert.equal((await read(join(out, 'iiif/manifest.json'))).id, 'https://iiif.example.com/iiif/manifest.json');
});

test('honours publish.full = false', async () => {
  const { content, out, siteConfig } = await setup('[publish]\nfull = false');
  await build({ contentDir: content, outDir: out, siteConfigPath: siteConfig, env: {} });
  const body = (await read(join(out, 'iiif/manifest.json'))).items[0].items[0].items[0].body;
  assert.match(body.id, /full\/1000,750\/0\/default\.jpg$/);
});

test('includes the optional description.md in the site config', async () => {
  const { content, out, siteConfig } = await setup();
  await writeFile(join(content, 'description.md'), '# About\n\nA harbour.');
  await build({ contentDir: content, outDir: out, siteConfigPath: siteConfig, env: {} });
  assert.equal((await read(siteConfig)).description, '# About\n\nA harbour.');
});
