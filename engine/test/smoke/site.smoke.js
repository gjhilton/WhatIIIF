// Builds the preview page and a set of awkwardly shaped images, then loads each one in a real browser
// (Chromium, via Playwright) with both viewers, zooming in until full-resolution pixels are asked for.
// Run with `npm run test:smoke`; the browser comes from `npx playwright install chromium-headless-shell`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build as buildClient } from 'vite';
import { build } from '../../lib/build.js';
import { makeImage } from '../fixtures.js';
import { tempDir } from '../tmp.js';

// A project-pages style address, with the site in a sub-folder. Requests are answered from disk, so no web server is needed.
const SITE = 'https://whatiiif.example/my-image';
// The shape that first showed a viewer asking for tiles that were never cut, then the slicer's awkward cases.
const SHAPES = [[3000, 2000], [4999, 3001], [1024, 1024], [513, 513], [300, 200], [2000, 37], [1, 1]];
// Each viewer's name and the element it draws into.
const VIEWERS = {
  openseadragon: { label: 'OpenSeadragon', surface: '.openseadragon-container' },
  mirador: { label: 'Mirador', surface: '.mirador-window' },
};
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const engine = (path) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

const built = new Map(); // "3000x2000" -> build output holding that image's iiif/ folder
let pageDir;
let browser;

before(async () => {
  for (const [width, height] of SHAPES) {
    const content = await tempDir('content');
    const out = await tempDir('built');
    await copyFile(await makeImage(width, height), join(content, 'smoke.tif'));
    await build({ contentDir: content, outDir: out, siteConfigPath: join(out, 'site.json'), env: { SITE_BASE_URL: SITE } });
    built.set(`${width}x${height}`, out);
  }

  // The page bundles generated/site.json. Only its URLs matter here and every image shares them, so borrow
  // that path for one build, then put back whatever a developer's own build left there.
  pageDir = await tempDir('page');
  const generated = engine('client/src/generated/site.json');
  const previous = await readFile(generated).catch(() => undefined);
  try {
    await mkdir(dirname(generated), { recursive: true });
    await copyFile(join(built.values().next().value, 'site.json'), generated);
    await buildClient({ configFile: engine('client/vite.config.ts'), build: { outDir: pageDir }, logLevel: 'error' });
  } finally {
    await (previous ? writeFile(generated, previous) : rm(generated, { force: true }));
  }
  browser = await chromium.launch();
});

after(() => browser?.close());

/** Opens the page for one image with the given viewer, recording every file fetched and anything that goes wrong. */
async function open(viewer, shape) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const fetched = [];
  const problems = [];
  page.on('pageerror', (error) => problems.push(`script error: ${error.message}`));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (!url.startsWith(`${SITE}/`)) {
      problems.push(`request to another site: ${url}`);
      return route.abort();
    }
    const path = decodeURIComponent(new URL(url).pathname).slice(new URL(SITE).pathname.length + 1) || 'index.html';
    try {
      const body = await readFile(join(path.startsWith('iiif/') ? built.get(shape) : pageDir, path));
      fetched.push(path);
      await route.fulfill({ body, contentType: TYPES[extname(path)] ?? 'application/octet-stream' });
    } catch {
      problems.push(`not published: ${path}`);
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });
  await page.goto(`${SITE}/?viewer=${viewer}`);
  return { page, fetched, problems };
}

async function until(condition, what, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

// Full-resolution pixels: a tile as many pixels across as the region it covers, or the whole image at its own size.
const FULL_RESOLUTION = /^iiif\/image\/(?:full\/max|\d+,\d+,(\d+),(\d+)\/\1,\2)\/0\/default\.jpg$/;

for (const [width, height] of SHAPES) {
  for (const [viewer, { label }] of Object.entries(VIEWERS)) {
    test(`${label} shows a ${width}x${height} image down to full resolution from the published files alone`, async () => {
      const { page, fetched, problems } = await open(viewer, `${width}x${height}`);

      const box = await page.locator('.viewer').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await until(async () => {
        await page.mouse.wheel(0, -300);
        return fetched.some((path) => FULL_RESOLUTION.test(path));
      }, 'full-resolution pixels to be requested');
      await page.waitForLoadState('networkidle');

      assert.deepEqual(problems, []);
      await page.close();
    });
  }
}

// Guards against page styles leaking into a viewer's own markup and squeezing it.
for (const [viewer, { label, surface }] of Object.entries(VIEWERS)) {
  test(`${label} fills the viewer pane`, async () => {
    const { page } = await open(viewer, '3000x2000');
    const drawn = await page.locator(surface).first().boundingBox();
    assert.deepEqual(drawn, await page.locator('.viewer').boundingBox());
    await page.close();
  });
}
