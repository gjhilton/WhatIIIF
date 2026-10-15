#!/usr/bin/env node
// The screenshots in the README: the demo's picture, published by this working tree's template, in light and dark,
// and the settings helper part-way through being filled in. Run after a change to how the page looks:
//
//   node engine/test/support/readme-screenshots.js
//
// It downloads the demo's picture, builds the site as the Deploy workflow would, and writes PNGs to engine/artwork.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { browse, commit, deploy, repo, templateCopy } from './harness.js';

const DEMO = 'gjhilton/whatiiif-demo';
const PICTURE = 'Concentric circles.png';
const SITE = 'https://gjhilton.github.io/whatiiif-demo';
const out = (name) => join(repo, 'engine/artwork', name);

const copy = await templateCopy();
const response = await fetch(`https://raw.githubusercontent.com/${DEMO}/main/content/${encodeURIComponent(PICTURE)}`);
if (!response.ok) throw new Error(`The demo's picture could not be downloaded: ${response.status}`);
await writeFile(join(copy, 'content', PICTURE), Buffer.from(await response.arrayBuffer()));
await commit(copy, 'The demo picture');
const site = await deploy(copy, { baseUrl: SITE, repository: DEMO });
if (!site.built) throw new Error(site.log);

const browser = await chromium.launch();
/** A screenshot of `query` on the site, settled, as a small PNG; `act` does anything to the page first. */
async function shoot(name, { query = '', colorScheme = 'light', size = { width: 1280, height: 860 }, fullPage = false, act } = {}) {
  const { page, close } = await browse(browser, { siteUrl: site.baseUrl, query, colorScheme, fileFor: (path) => join(site.dist, path) });
  await page.setViewportSize(size);
  await page.waitForLoadState('networkidle');
  if (act) await act(page);
  await page.waitForTimeout(1500); // the viewer draws its tiles a moment after they arrive
  const png = await page.screenshot({ fullPage });
  await sharp(png).png({ palette: true, quality: 95, effort: 10 }).toFile(out(name));
  await close();
}

await shoot('demo.png', { query: '?viewer=openseadragon', fullPage: true });
await shoot('demo-dark.png', { query: '?viewer=openseadragon', colorScheme: 'dark', fullPage: true });
await shoot('settings.png', {
  query: 'settings.html',
  size: { width: 1280, height: 900 },
  act: async (page) => {
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Concentric circles');
    await page.getByRole('textbox', { name: 'Summary', exact: true }).fill('Rings of flat colour, eighteen thousand pixels across.');
    await page.evaluate(() => document.activeElement.blur()); // no focus ring in the picture
  },
});
await browser.close();
console.log('Written: engine/artwork/demo.png, demo-dark.png and settings.png');
