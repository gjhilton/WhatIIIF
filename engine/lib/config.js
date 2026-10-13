import { parse } from 'smol-toml';
import { basename, extname } from 'node:path';

export const VIEWERS = ['openseadragon', 'mirador'];
const TOP_LEVEL = ['title', 'summary', 'attribution', 'rights', 'viewer', 'base_url', 'metadata', 'tiles', 'publish'];

const fail = (message) => {
  throw new Error(`content/whatiiif.toml: ${message}`);
};

function checkKeys(table, allowed, where) {
  for (const key of Object.keys(table)) {
    if (!allowed.includes(key)) fail(`unknown setting "${where}${key}". Valid settings here: ${allowed.join(', ')}`);
  }
}

// IIIF only accepts Creative Commons and RightsStatements.org URIs as `rights`, in the http:// form they are defined with.
const RIGHTS = /^https?:\/\/(?:www\.)?((?:creativecommons\.org\/(?:licenses|publicdomain)|rightsstatements\.org\/vocab)\/.+)$/;

const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Parses whatiiif.toml text into a config with defaults applied. Throws readable errors. */
export function parseConfig(text, { imageName }) {
  let raw;
  try {
    raw = parse(text);
  } catch (error) {
    throw new Error(`content/whatiiif.toml is not valid TOML: ${error.message}`);
  }
  checkKeys(raw, TOP_LEVEL, '');

  const tiles = raw.tiles ?? {};
  const publish = raw.publish ?? {};
  checkKeys(tiles, ['size', 'quality'], 'tiles.');
  checkKeys(publish, ['full'], 'publish.');

  const config = {
    title: raw.title ?? basename(imageName, extname(imageName)),
    summary: raw.summary,
    attribution: raw.attribution,
    rights: raw.rights,
    viewer: raw.viewer ?? VIEWERS[0],
    base_url: raw.base_url?.replace(/\/+$/, ''),
    metadata: (raw.metadata ?? []).map((pair, i) => {
      if (typeof pair.label !== 'string' || typeof pair.value !== 'string') {
        fail(`each [[metadata]] entry needs a text "label" and "value" (entry ${i + 1})`);
      }
      return { label: pair.label, value: pair.value };
    }),
    tiles: { size: tiles.size ?? 512, quality: tiles.quality ?? 85 },
    publish: { full: publish.full ?? true },
  };

  if (config.rights !== undefined) {
    const known = RIGHTS.exec(config.rights);
    if (!known) {
      fail(
        `"rights" must be a Creative Commons or RightsStatements.org URL, for example https://creativecommons.org/licenses/by/4.0/ (got "${config.rights}"). Describe any other terms in "attribution" instead.`,
      );
    }
    config.rights = `http://${known[1]}`;
  }
  if (!VIEWERS.includes(config.viewer)) {
    fail(`"viewer" must be one of: ${VIEWERS.join(', ')} (got "${config.viewer}")`);
  }
  if (config.base_url !== undefined && !isHttpUrl(config.base_url)) {
    fail(`"base_url" must be a URL such as https://example.org/my-image (got "${config.base_url}")`);
  }
  if (!Number.isInteger(config.tiles.size) || config.tiles.size < 1) {
    fail(`"tiles.size" must be a positive whole number (got ${config.tiles.size})`);
  }
  if (!Number.isInteger(config.tiles.quality) || config.tiles.quality < 1 || config.tiles.quality > 100) {
    fail(`"tiles.quality" must be a whole number from 1 to 100 (got ${config.tiles.quality})`);
  }
  return config;
}
