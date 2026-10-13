import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../lib/config.js';

const opts = { imageName: 'harbour-1890.tif' };

test('an empty config gets defaults, with the title taken from the image filename', () => {
  const c = parseConfig('', opts);
  assert.equal(c.title, 'harbour-1890');
  assert.equal(c.viewer, 'openseadragon');
  assert.equal(c.tiles.size, 512);
  assert.equal(c.tiles.quality, 85);
  assert.equal(c.publish.full, true);
  assert.deepEqual(c.metadata, []);
});

test('reads every documented field', () => {
  const c = parseConfig(
    `
title = "Harbour"
summary = "A view."
attribution = "Example Museum"
rights = "https://creativecommons.org/licenses/by/4.0/"
viewer = "mirador"
base_url = "https://iiif.example.org/"

[[metadata]]
label = "Date"
value = "1890"

[tiles]
size = 256
quality = 70

[publish]
full = false
`,
    opts,
  );
  assert.equal(c.title, 'Harbour');
  assert.equal(c.attribution, 'Example Museum');
  assert.equal(c.viewer, 'mirador');
  assert.equal(c.base_url, 'https://iiif.example.org');
  assert.deepEqual(c.metadata, [{ label: 'Date', value: '1890' }]);
  assert.equal(c.tiles.size, 256);
  assert.equal(c.publish.full, false);
});

test('rejects a rights value that is not a URL, naming the field', () => {
  assert.throws(() => parseConfig('rights = "CC-BY"', opts), /rights.*URL/);
});

test('rejects an unknown viewer and lists the valid ones', () => {
  assert.throws(() => parseConfig('viewer = "uv"', opts), /viewer.*openseadragon, mirador/);
});

test('rejects unknown keys so typos are not silently ignored', () => {
  assert.throws(() => parseConfig('titel = "x"', opts), /unknown.*titel/i);
});

test('rejects a tile size that is not a positive integer', () => {
  assert.throws(() => parseConfig('[tiles]\nsize = 0', opts), /tiles\.size/);
});

test('reports TOML syntax errors in plain English', () => {
  assert.throws(() => parseConfig('title = ', opts), /whatiiif\.toml.*not valid TOML/);
});

// IIIF (and its schema) only accept these URIs in the http:// form their publishers define, but people paste https.
const rights = [
  ['https://creativecommons.org/licenses/by/4.0/', 'http://creativecommons.org/licenses/by/4.0/'],
  ['https://www.creativecommons.org/licenses/by-sa/4.0/', 'http://creativecommons.org/licenses/by-sa/4.0/'],
  ['https://creativecommons.org/publicdomain/zero/1.0/', 'http://creativecommons.org/publicdomain/zero/1.0/'],
  ['https://rightsstatements.org/vocab/InC/1.0/', 'http://rightsstatements.org/vocab/InC/1.0/'],
  ['http://creativecommons.org/licenses/by-nc/4.0/', 'http://creativecommons.org/licenses/by-nc/4.0/'],
];

for (const [given, canonical] of rights) {
  test(`publishes the rights URL ${given} in its canonical http form`, () => {
    assert.equal(parseConfig(`rights = "${given}"`, opts).rights, canonical);
  });
}

test('rejects a rights URL IIIF viewers would not recognise and points to attribution instead', () => {
  assert.throws(
    () => parseConfig('rights = "https://example.org/terms"', opts),
    /rights.*Creative Commons.*RightsStatements\.org.*attribution/s,
  );
});
