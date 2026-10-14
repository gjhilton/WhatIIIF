// Checks a site that is already built or already live, as a visitor's browser would find it:
//
//   E2E_SITE_URL=https://you.github.io/your-image node --test engine/test/e2e/check-site.js
//
// E2E_SITE_URL is the address the site was built for. Add E2E_DIST=dist to have every request answered
// from that folder instead of the network, for a site that is built but not yet deployed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { expectedRequests } from '../../lib/requests.js';
import { schemaProblems, schemaUnavailable } from '../schema.js';
import { browse, zoomToFullResolution } from './harness.js';

const siteUrl = process.env.E2E_SITE_URL?.replace(/\/+$/, '');
const dist = process.env.E2E_DIST;
if (!siteUrl) throw new Error('Set E2E_SITE_URL to the address of the site to check.');

const fileFor = dist && ((path) => join(dist, path));
const json = async (path) => JSON.parse(dist ? await readFile(join(dist, path), 'utf8') : await (await fetch(`${siteUrl}/${path}`)).text());
const published = async (path) => (dist ? readFile(join(dist, path)).then(() => true, () => false) : (await fetch(`${siteUrl}/${path}`, { method: 'HEAD' })).ok);

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(() => browser?.close());

test('the page opens and is titled after the image', async () => {
  const { title } = await json('site.json');
  const { page, problems, close } = await browse(browser, { siteUrl, fileFor });
  await page.locator('h1').waitFor();
  assert.equal(await page.locator('h1').textContent(), title);
  assert.equal(await page.title(), title);
  assert.deepEqual(problems, []);
  await close();
});

for (const [viewer, label] of [['openseadragon', 'OpenSeadragon'], ['mirador', 'Mirador']]) {
  test(`${label} zooms to full resolution without asking for anything that is not there`, async () => {
    const site = await browse(browser, { siteUrl, fileFor, query: `?viewer=${viewer}` });
    await zoomToFullResolution(site);
    assert.deepEqual(site.problems, []);
    await site.close();
  });
}

test('the image service is where it says it is, with every file a viewer could ask for', async () => {
  const info = await json('iiif/image/info.json');
  assert.equal(info.id, `${siteUrl}/iiif/image`);
  const missing = [];
  for (const path of expectedRequests(info)) {
    if (!(await published(`iiif/image/${path}`))) missing.push(path);
  }
  assert.deepEqual(missing, []);
});

test('the manifest is where it says it is and paints that image service', async () => {
  const manifest = await json('iiif/manifest.json');
  assert.equal(manifest.id, `${siteUrl}/iiif/manifest.json`);
  assert.equal(manifest.items[0].items[0].items[0].body.service[0].id, `${siteUrl}/iiif/image`);
});

test('the manifest is valid IIIF Presentation 3.0', { skip: schemaUnavailable }, async () => {
  assert.deepEqual(schemaProblems(await json('iiif/manifest.json')), []);
});
