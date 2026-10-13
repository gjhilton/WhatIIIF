import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { parseConfig } from './config.js';
import { findSourceImage } from './source.js';
import { slice } from './slice.js';
import { applyBudget } from './budget.js';
import { validate } from './validate.js';
import { buildManifest } from './manifest.js';
import { originalUrl } from './original.js';

const run = promisify(execFile);
const LOCAL_BASE_URL = 'http://localhost:4173';

const readOptional = (path) => readFile(path, 'utf8').catch((e) => (e.code === 'ENOENT' ? undefined : Promise.reject(e)));

async function isLfs(contentDir, file) {
  try {
    const { stdout } = await run('git', ['check-attr', 'filter', '--', basename(file)], { cwd: contentDir });
    return /filter: lfs/.test(stdout);
  } catch {
    return false;
  }
}

/**
 * Turns the committed content into the IIIF files in `outDir/iiif` and the
 * config the React client is built with (`siteConfigPath`).
 */
export async function build({ contentDir, outDir, siteConfigPath, env = process.env, log = () => {} }) {
  const source = await findSourceImage(contentDir);
  const config = parseConfig((await readOptional(join(contentDir, 'whatiiif.toml'))) ?? '', { imageName: basename(source) });
  const description = await readOptional(join(contentDir, 'description.md'));

  const baseUrl = (config.base_url ?? env.SITE_BASE_URL ?? LOCAL_BASE_URL).replace(/\/+$/, '');
  const imageId = `${baseUrl}/iiif/image`;
  const manifestId = `${baseUrl}/iiif/manifest.json`;
  const imageDir = join(outDir, 'iiif/image');

  log(`Slicing ${basename(source)}…`);
  await slice({ source, outDir: imageDir, id: imageId, tileSize: config.tiles.size, quality: config.tiles.quality, publishFull: config.publish.full });

  const info = JSON.parse(await readFile(join(imageDir, 'info.json'), 'utf8'));
  const { bytes, droppedFull } = await applyBudget({ dir: imageDir, info });
  if (droppedFull) log('Site was over the Pages size budget, so the full-size download (full/max) was left out.');

  const problems = await validate(imageDir);
  if (problems.length) {
    throw new Error(`The generated IIIF service is incomplete, so nothing was deployed:\n - ${problems.join('\n - ')}`);
  }

  const original = originalUrl({
    repo: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF_NAME,
    path: `content/${basename(source)}`,
    lfs: await isLfs(contentDir, source),
  });
  const hasFull = config.publish.full && !droppedFull;
  const manifest = buildManifest({ manifestId, imageId, info, config, hasFull, originalUrl: original });
  await writeFile(join(outDir, 'iiif/manifest.json'), JSON.stringify(manifest, null, 2));

  const site = {
    title: config.title,
    summary: config.summary,
    attribution: config.attribution,
    rights: config.rights,
    metadata: config.metadata,
    description,
    viewer: config.viewer,
    manifestUrl: manifestId,
    infoUrl: `${imageId}/info.json`,
    fullUrl: hasFull ? `${imageId}/full/max/0/default.jpg` : undefined,
    originalUrl: original,
    width: info.width,
    height: info.height,
  };
  await mkdir(dirname(siteConfigPath), { recursive: true });
  await writeFile(siteConfigPath, JSON.stringify(site, null, 2));

  log(`Done: ${Math.round(bytes / 1024 / 1024)} MB of IIIF files at ${baseUrl}/iiif/`);
  return { baseUrl, manifestId, bytes, droppedFull };
}
