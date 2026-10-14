// Whole journeys through the template, as its users make them: a repository made from the template, an image
// committed the way they would commit it, the commands the Deploy workflow runs, and the site that comes
// out, opened in a real browser (Chromium, via Playwright).
import { suite, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { access, copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { validate } from '../../lib/validate.js';
import { inspect, makeImage, makePhonePhoto, makeVariant } from '../fixtures.js';
import { schemaProblems, schemaUnavailable } from '../schema.js';
import { browse, commit, deploy, git, run, templateCopy, zoomToFullResolution } from './harness.js';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = (path) => access(path).then(() => true, () => false);

let browser;
before(async () => {
  browser = await chromium.launch();
});
after(() => browser?.close());

const open = (site, query, options) => browse(browser, { siteUrl: site.baseUrl, query, fileFor: (path) => join(site.dist, path), ...options });

test('a fresh copy of the template has nothing to publish yet, and says so instead of failing', async () => {
  const site = await deploy(await templateCopy());
  assert.equal(site.skipped, true);
  assert.match(site.log, /::notice::No image in content\/ yet/);
});

suite('a photographer uploads a phone photo on github.com and fills in every setting', () => {
  let site;

  before(async () => {
    const repo = await templateCopy();
    await copyFile(await makePhonePhoto(), join(repo, 'content/Harbour view.jpg'));
    await writeFile(
      join(repo, 'content/whatiiif.toml'),
      [
        'title = "Harbour at dusk"',
        'summary = "The fishing fleet coming in."',
        'attribution = "Example Museum"',
        'rights = "https://creativecommons.org/licenses/by/4.0/"',
        '',
        '[[metadata]]',
        'label = "Date"',
        'value = "1890"',
      ].join('\n'),
    );
    await writeFile(join(repo, 'content/description.md'), '## About this view\n\nTaken from the *north* pier.\n');
    await commit(repo, 'Add my photo'); // stored whole: github.com does not put uploads into Git LFS
    site = await deploy(repo, { baseUrl: 'https://gjh.github.io/harbour', repository: 'gjh/harbour' });
  });

  test('the build succeeds and says what it made', () => {
    assert.equal(site.built, true, site.log);
    assert.match(site.log, /Done: \d+ MB of IIIF files at https:\/\/gjh\.github\.io\/harbour\/iiif\//);
  });

  test('the image service is complete, at its Pages address, and upright', async () => {
    const info = await json(join(site.dist, 'iiif/image/info.json'));
    assert.equal(info.id, 'https://gjh.github.io/harbour/iiif/image');
    assert.deepEqual([info.width, info.height], [1200, 1600]);
    assert.deepEqual(await validate(join(site.dist, 'iiif/image')), []);
  });

  test('nothing the camera recorded is published: no location, no rotation tag, no wide-gamut numbers', async () => {
    const { exif, orientation, space, width, height } = await inspect(join(site.dist, 'iiif/image/full/max/0/default.jpg'));
    assert.deepEqual({ exif, orientation, space, width, height }, { exif: false, orientation: 1, space: 'srgb', width: 1200, height: 1600 });
  });

  test('the manifest says what the settings said and links the original on the host that serves it', async () => {
    const manifest = await json(join(site.dist, 'iiif/manifest.json'));
    assert.equal(manifest.id, 'https://gjh.github.io/harbour/iiif/manifest.json');
    assert.deepEqual(manifest.label, { en: ['Harbour at dusk'] });
    assert.deepEqual(manifest.summary, { en: ['The fishing fleet coming in.'] });
    assert.deepEqual(manifest.requiredStatement.value, { en: ['Example Museum'] });
    assert.equal(manifest.rights, 'http://creativecommons.org/licenses/by/4.0/');
    assert.deepEqual(manifest.metadata, [{ label: { en: ['Date'] }, value: { en: ['1890'] } }]);
    assert.deepEqual([manifest.items[0].width, manifest.items[0].height], [1200, 1600]);
    // Not in LFS, whatever .gitattributes says, so the LFS media host would answer 404.
    assert.equal(manifest.rendering[0].id, 'https://raw.githubusercontent.com/gjh/harbour/main/content/Harbour%20view.jpg');
  });

  test('the manifest is valid IIIF Presentation 3.0', { skip: schemaUnavailable }, async () => {
    assert.deepEqual(schemaProblems(await json(join(site.dist, 'iiif/manifest.json'))), []);
  });

  test('the page shows the title, the description and every detail', async () => {
    const { page, problems, close } = await open(site);
    await page.locator('h1').waitFor();
    assert.equal(await page.locator('h1').textContent(), 'Harbour at dusk');
    assert.equal(await page.locator('.masthead p').textContent(), 'The fishing fleet coming in.');
    assert.equal(await page.title(), 'Harbour at dusk');
    assert.equal(await page.locator('.prose h2').textContent(), 'About this view');
    assert.equal(await page.locator('.prose em').textContent(), 'north');
    const rows = await page.locator('.meta tr').evaluateAll((trs) => trs.map((tr) => [...tr.children].map((cell) => cell.textContent)));
    assert.deepEqual(rows, [
      ['Date', '1890'],
      ['Dimensions', '1,200 × 1,600 px'],
      ['Attribution', 'Example Museum'],
      ['Rights', 'http://creativecommons.org/licenses/by/4.0/'],
    ]);
    assert.equal(await page.getByRole('group', { name: 'Language' }).count(), 0, 'one language, so no switch');
    assert.deepEqual(problems, []);
    await close();
  });

  test('the manifest and image service addresses are shown and can be copied', async () => {
    const { page, close } = await open(site);
    const fields = page.locator('.copy-field');
    await fields.first().waitFor();
    assert.deepEqual(await fields.locator('input').evaluateAll((inputs) => inputs.map((input) => input.value)), [
      'https://gjh.github.io/harbour/iiif/manifest.json',
      'https://gjh.github.io/harbour/iiif/image/info.json',
    ]);
    await fields.first().locator('button').click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'https://gjh.github.io/harbour/iiif/manifest.json');
    assert.equal(await fields.first().locator('button').textContent(), 'Copied');
    await close();
  });

  test('the download links lead to the full-size JPEG, which is published, and to the original on GitHub', async () => {
    const { page, close } = await open(site);
    const href = (name) => page.getByRole('link', { name }).getAttribute('href');
    assert.equal(await href('Download full-size JPEG'), 'https://gjh.github.io/harbour/iiif/image/full/max/0/default.jpg');
    assert.equal(await href('Download original file'), 'https://raw.githubusercontent.com/gjh/harbour/main/content/Harbour%20view.jpg');
    assert.equal(await href('View manifest'), 'https://gjh.github.io/harbour/iiif/manifest.json');
    assert.equal(await exists(join(site.dist, 'iiif/image/full/max/0/default.jpg')), true);
    await close();
  });

  test('OpenSeadragon opens first and zooms to full resolution', async () => {
    const opened = await open(site);
    await opened.page.locator('.openseadragon-container').first().waitFor(); // the viewer; its mini-map is a second one
    assert.equal(await opened.page.getByRole('button', { name: 'OpenSeadragon' }).getAttribute('aria-pressed'), 'true');
    await zoomToFullResolution(opened);
    assert.deepEqual(opened.problems, []);
    await opened.close();
  });

  test('a visitor can switch to Mirador, and the address then remembers the choice', async () => {
    const opened = await open(site);
    await opened.page.getByRole('button', { name: 'Mirador' }).click();
    await opened.page.locator('.mirador-window').waitFor();
    assert.equal(new URL(opened.page.url()).searchParams.get('viewer'), 'mirador');
    assert.equal(await opened.page.locator('.openseadragon-container').count() > 0, true); // Mirador draws with OpenSeadragon too
    await zoomToFullResolution(opened);
    assert.deepEqual(opened.problems, []);
    await opened.close();

    const linked = await open(site, '?viewer=mirador');
    await linked.page.locator('.mirador-window').waitFor();
    assert.equal(await linked.page.getByRole('button', { name: 'Mirador' }).getAttribute('aria-pressed'), 'true');
    await linked.close();
  });
});

suite('a Welsh archive publishes its image in Welsh and English', () => {
  let site;

  before(async () => {
    const repo = await templateCopy();
    await copyFile(await makeImage(1600, 1200), join(repo, 'content/harbwr.tif'));
    await writeFile(
      join(repo, 'content/whatiiif.toml'),
      [
        'language = "cy"',
        'title = { cy = "Harbwr", en = "Harbour" }',
        'summary = { cy = "Y llongau pysgota yn dod adref.", en = "The fishing fleet coming home." }',
        'attribution = "Archifau Enghraifft"',
        '',
        '[[metadata]]',
        'label = { cy = "Dyddiad", en = "Date" }',
        'value = "1890"',
      ].join('\n'),
    );
    await writeFile(join(repo, 'content/description.md'), 'Golygfa o\'r *pier*.\n');
    await writeFile(join(repo, 'content/description.en.md'), 'Seen from the *pier*.\n');
    await commit(repo, 'Add the image');
    site = await deploy(repo);
  });

  test('the manifest gives each text in both languages', async () => {
    assert.equal(site.built, true, site.log);
    const manifest = await json(join(site.dist, 'iiif/manifest.json'));
    assert.deepEqual(manifest.label, { cy: ['Harbwr'], en: ['Harbour'] });
    assert.deepEqual(manifest.metadata, [{ label: { cy: ['Dyddiad'], en: ['Date'] }, value: { cy: ['1890'] } }]);
  });

  test('the bilingual manifest is valid IIIF Presentation 3.0', { skip: schemaUnavailable }, async () => {
    assert.deepEqual(schemaProblems(await json(join(site.dist, 'iiif/manifest.json'))), []);
  });

  // What the page shows, as [element, its text, its lang attribute], for a browser that prefers `locale`.
  const shown = async (options) => {
    const { page, problems, close } = await open(site, '', options);
    await page.locator('h1').waitFor();
    const read = (selector) => page.locator(selector).first().evaluate((el) => [el.textContent, el.closest('[lang]')?.getAttribute('lang')]);
    const result = {
      title: await read('h1'),
      summary: await read('.masthead p'),
      description: await read('.prose p'),
      firstRow: await read('.meta th'),
      pageTitle: await page.title(),
    };
    assert.deepEqual(problems, []);
    await close();
    return result;
  };

  test('a visitor whose browser prefers Welsh reads Welsh, marked as Welsh', async () => {
    assert.deepEqual(await shown({ locale: 'cy-GB' }), {
      title: ['Harbwr', 'cy'],
      summary: ['Y llongau pysgota yn dod adref.', 'cy'],
      description: ["Golygfa o'r pier.", 'cy'],
      firstRow: ['Dyddiad', 'cy'],
      pageTitle: 'Harbwr',
    });
  });

  test('a visitor whose browser prefers English reads English, and Welsh where there is no English', async () => {
    const english = await shown({ locale: 'en-GB' });
    assert.deepEqual(english.title, ['Harbour', 'en']);
    assert.deepEqual(english.description, ['Seen from the pier.', 'en']);
    const { page, close } = await open(site, '', { locale: 'en-GB' });
    await page.locator('h1').waitFor();
    const attribution = page.locator('.meta tr', { hasText: 'Attribution' }).locator('td');
    assert.deepEqual(await attribution.evaluate((el) => [el.textContent, el.getAttribute('lang')]), ['Archifau Enghraifft', 'cy']);
    await close();
  });

  test('the language switch changes the page, and the address remembers the choice', async () => {
    const { page, close } = await open(site, '', { locale: 'en-GB' });
    // Each language is offered under its own name for itself, as far as the browser knows it, Welsh first as the site's own.
    const switcher = page.getByRole('group', { name: 'Language' });
    const ownName = (tag) => page.evaluate((t) => new Intl.DisplayNames([t], { type: 'language' }).of(t), tag);
    assert.deepEqual(await switcher.getByRole('button').evaluateAll((buttons) => buttons.map((b) => b.lang)), ['cy', 'en']);
    assert.deepEqual(await switcher.getByRole('button').allTextContents(), [await ownName('cy'), await ownName('en')]);
    await switcher.locator('button[lang="cy"]').click();
    assert.equal(await page.locator('h1').textContent(), 'Harbwr');
    assert.equal(new URL(page.url()).searchParams.get('lang'), 'cy');
    await close();

    assert.deepEqual((await shown({ locale: 'en-GB', query: '?lang=cy' })).title, ['Harbwr', 'cy']);
  });
});

const lfs = await run('git', ['lfs', 'version']).then(({ code }) => code === 0, () => false);

suite('an archive commits a 16-bit scan through Git LFS and changes no settings', { skip: !lfs && 'git-lfs is not installed' }, () => {
  let repo;
  let site;

  before(async () => {
    repo = await templateCopy();
    await git(repo, ['lfs', 'install', '--local'], { lfs: true });
    await copyFile(await makeVariant('rgb16', 2600, 1800), join(repo, 'content/Survey_1856.png'));
    await commit(repo, 'Add the scan', { lfs: true });
    site = await deploy(repo);
  });

  test('git really holds a pointer, not the image', async () => {
    const { stdout } = await git(repo, ['cat-file', '-p', 'HEAD:content/Survey_1856.png']);
    assert.match(stdout, /^version https:\/\/git-lfs\.github\.com\/spec\/v1\n/);
  });

  test('the site is built, named after the file, with the original linked on the LFS media host', async () => {
    assert.equal(site.built, true, site.log);
    const manifest = await json(join(site.dist, 'iiif/manifest.json'));
    assert.deepEqual(manifest.label, { en: ['Survey_1856'] });
    assert.equal(manifest.rendering[0].id, 'https://media.githubusercontent.com/media/example/my-image/main/content/Survey_1856.png');
  });

  test('the 16-bit scan is published as ordinary 8-bit sRGB JPEG tiles that a viewer can zoom into fully', async () => {
    const { depth, space, channels } = await inspect(join(site.dist, 'iiif/image/0,0,512,512/512,512/0/default.jpg'));
    assert.deepEqual({ depth, space, channels }, { depth: 'uchar', space: 'srgb', channels: 3 });
    assert.deepEqual(await validate(join(site.dist, 'iiif/image')), []);

    const opened = await open(site);
    assert.equal(await opened.page.locator('h1').textContent(), 'Survey_1856');
    await zoomToFullResolution(opened);
    assert.deepEqual(opened.problems, []);
    await opened.close();
  });

  test('replacing the image and deploying again leaves nothing of the old one', async () => {
    await rm(join(repo, 'content/Survey_1856.png'));
    await copyFile(await makeImage(300, 200), join(repo, 'content/postcard.tif'));
    await commit(repo, 'Swap the image', { lfs: true });
    const again = await deploy(repo);

    assert.equal(again.built, true, again.log);
    const { title, width, height } = await json(join(again.dist, 'site.json'));
    assert.deepEqual({ title, width, height }, { title: { en: 'postcard' }, width: 300, height: 200 });
    assert.deepEqual(await readdir(join(again.dist, 'iiif/image')), ['full', 'info.json']); // one tile: the whole image

    const opened = await open(again);
    await zoomToFullResolution(opened);
    assert.deepEqual(opened.problems, []);
    await opened.close();
  });
});

// What someone gets wrong, and the sentence that must tell them so. Nothing may be built for deployment.
const mistakes = [
  {
    name: 'commits two images',
    files: { 'a.png': 'x', 'b.jpg': 'x' },
    says: /Build failed: content\/ must contain exactly one image, but found 2: a\.png, b\.jpg\. Remove the extras\./,
  },
  {
    name: 'commits a format that cannot be read yet',
    files: { 'scan.heic': 'x' },
    says: /Build failed: scan\.heic is not supported yet\. Convert it to TIFF, PNG or JPEG/,
  },
  {
    name: 'misspells a setting',
    files: { 'a.png': 'x', 'whatiiif.toml': 'titel = "Harbour"' },
    says: /Build failed: content\/whatiiif\.toml: unknown setting "titel"\. Valid settings here: language, title, summary/,
  },
  {
    name: 'leaves the settings file half-written',
    files: { 'a.png': 'x', 'whatiiif.toml': 'title = ' },
    says: /Build failed: content\/whatiiif\.toml is not valid TOML/,
  },
  {
    name: 'gives their own terms page as the rights URL',
    files: { 'a.png': 'x', 'whatiiif.toml': 'rights = "https://example.org/terms"' },
    says: /Build failed: content\/whatiiif\.toml: "rights" must be a Creative Commons or RightsStatements\.org URL.*Describe any other terms in "attribution" instead\./,
  },
];

for (const { name, files, says } of mistakes) {
  test(`someone who ${name} is told what to fix, and nothing is built`, async () => {
    const repo = await templateCopy();
    for (const [file, content] of Object.entries(files)) await writeFile(join(repo, 'content', file), content);
    await commit(repo, 'A mistake');
    const site = await deploy(repo);

    assert.equal(site.built, false);
    assert.equal(site.code, 1);
    assert.match(site.log, says);
    assert.equal(await exists(join(site.dist, 'index.html')), false);
  });
}
