// Checks the manifests we build against the JSON schema of the official IIIF Presentation validator.
// That schema is published without a licence, so it is downloaded (pinned to a commit) rather than
// copied into this repository; without a connection these tests are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { parseConfig } from '../lib/config.js';
import { buildManifest } from '../lib/manifest.js';

const SCHEMA_URL =
  'https://raw.githubusercontent.com/IIIF/presentation-validator/455c3c325b49e61ac6c393c385d9478e68ce42bd/schema/iiif_3_0.json';

const schema = await fetch(SCHEMA_URL, { signal: AbortSignal.timeout(15_000) }).then(
  (response) => (response.ok ? response.json() : undefined),
  () => undefined,
);
const validate = schema && new Ajv({ strict: false, validateFormats: false }).compile(schema);
const skip = !schema && 'the IIIF Presentation schema could not be downloaded';

const base = {
  manifestId: 'https://example.org/site/iiif/manifest.json',
  imageId: 'https://example.org/site/iiif/image',
  info: {
    width: 4999,
    height: 3001,
    sizes: [
      { width: 313, height: 188 },
      { width: 625, height: 376 },
      { width: 1250, height: 751 },
    ],
  },
  hasFull: true,
};

const everySetting = `
title = "Harbour"
summary = "A view."
attribution = "Example Museum"
rights = "https://creativecommons.org/licenses/by/4.0/"

[[metadata]]
label = "Date"
value = "1890"
`;

const cases = {
  'an image with no settings': {},
  'every setting, with a link to the original file': {
    toml: everySetting,
    originalUrl: 'https://media.githubusercontent.com/media/gjh/harbour/main/content/Harbour%20view.tif',
  },
  'a site without the full-size JPEG': { hasFull: false },
  'an image too small to have other sizes': { info: { width: 300, height: 200, sizes: [] } },
};

for (const [name, { toml = '', ...overrides }] of Object.entries(cases)) {
  test(`the manifest for ${name} passes the IIIF Presentation 3.0 schema`, { skip }, () => {
    const config = parseConfig(toml, { imageName: 'harbour.tif' });
    const manifest = buildManifest({ ...base, config, ...overrides });
    assert.equal(validate(manifest), true, JSON.stringify(validate.errors?.slice(0, 5), null, 2));
  });
}
