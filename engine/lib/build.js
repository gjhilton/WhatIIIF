import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readContent } from './content.js';
import { slice } from './slice.js';
import { PAGES_BUDGET_BYTES, applyBudget } from './budget.js';
import { missingFiles } from './service.js';
import { buildManifest } from './manifest.js';
import { committedToLfs, originalUrl, repositoryIsPublic } from './original.js';
import { cardImage, makeIcon, personalisePage } from './page.js';

const LOCAL_BASE_URL = 'http://localhost:4173';
const LOWEST_QUALITY = 45; // below this, JPEG tiles look blocky up close

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

/** The JPEG qualities to try, best first: the one asked for, then lower ones until the site fits GitHub Pages. */
const qualities = (asked) => [asked, ...[75, 65, 55, LOWEST_QUALITY].filter((quality) => quality < asked)];

/** Where visitors can download the picture the site was made from, if they can and its owner wants them to. */
async function original(image, config, env) {
  if (!config.publish.original) return undefined;
  if (image.url) return image.url; // linked in whatiiif.toml, so it is already on the web
  if (!(await repositoryIsPublic(env))) return undefined;
  const lfs = await committedToLfs(image.path);
  return originalUrl({ repo: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF_NAME, path: `content/${image.name}`, lfs });
}

/**
 * Turns the committed content into everything in `outDir` that depends on it: the IIIF image service and
 * manifest under iiif/, site.json, which the preview page loads when it opens, an icon, and, if the page has been
 * built already, its title, colours, social-card tags, the fallback shown without JavaScript, and site.json again.
 * `warn` is told about anything the owner may want to put right that does not stop the build.
 */
export async function build({ contentDir, outDir, env = process.env, log = () => {}, warn = log, fetch = globalThis.fetch, budgetBytes = PAGES_BUDGET_BYTES }) {
  const downloads = await mkdtemp(join(tmpdir(), 'whatiiif-picture-'));
  try {
    const { image, config, description, languages, notes } = await readContent(contentDir, { fetch, downloads });
    for (const note of notes) warn(note);

    const baseUrl = (config.base_url ?? env.SITE_BASE_URL ?? LOCAL_BASE_URL).replace(/\/+$/, '');
    const pageUrl = `${baseUrl}/`;
    const imageId = `${baseUrl}/iiif/image`;
    const manifestId = `${baseUrl}/iiif/manifest.json`;
    const imageDir = join(outDir, 'iiif/image');

    // Sliced at the quality asked for, then, if the tiles are too big for GitHub Pages even without the full-size
    // JPEG, again at lower qualities until they fit.
    const { size: tileSize, quality: asked } = config.tiles;
    let info;
    let fitted;
    let quality;
    for (quality of qualities(asked)) {
      log(`Slicing ${image.name} at quality ${quality}…`);
      await rm(imageDir, { recursive: true, force: true }); // a rebuild must not inherit tiles from the previous image
      info = await slice({ source: image.path, outDir: imageDir, id: imageId, tileSize, quality, publishFull: config.publish.full });
      fitted = await applyBudget({ dir: imageDir, info, budgetBytes });
      if (fitted.fits) break;
    }
    const { bytes, droppedFull } = fitted;
    if (!fitted.fits) {
      const scale = Math.floor(Math.sqrt(budgetBytes / bytes) * 100);
      throw new Error(
        `The picture is too big for GitHub Pages: its tiles take ${megabytes(bytes)} even at quality ${quality}, and ${megabytes(budgetBytes)} fit. Make it smaller: about ${scale}% of its width and height would fit.`,
      );
    }
    if (droppedFull) warn('The site would have been too big for GitHub Pages, so the full-size JPEG was left out.');
    if (quality < asked) warn(`The tiles were too big for GitHub Pages at quality ${asked}, so they were made at quality ${quality}.`);

    const missing = await missingFiles(imageDir);
    if (missing.length) {
      throw new Error(`The generated IIIF service is incomplete, so nothing was deployed. Missing:\n - ${missing.join('\n - ')}`);
    }

    const originalLink = await original(image, config, env);
    const hasFull = config.publish.full && !droppedFull;
    const manifest = buildManifest({ manifestId, imageId, pageUrl, info, config, hasFull, original: originalLink && { url: originalLink, format: image.format } });
    await writeFile(join(outDir, 'iiif/manifest.json'), JSON.stringify(manifest, null, 2));

    const site = {
      language: config.language,
      languages,
      title: config.title,
      summary: config.summary,
      attribution: config.attribution,
      alt: config.alt,
      rights: config.rights,
      metadata: config.metadata,
      description,
      viewer: config.viewer,
      colours: config.colours,
      manifestUrl: manifestId,
      canvasId: manifest.items[0].id,
      infoUrl: `${imageId}/info.json`,
      fullUrl: hasFull ? `${imageId}/full/max/0/default.jpg` : undefined,
      fullBytes: hasFull ? (await stat(join(imageDir, 'full/max/0/default.jpg'))).size : undefined,
      originalUrl: originalLink,
      originalBytes: originalLink && image.bytes,
      originalFormat: originalLink && image.format,
      width: info.width,
      height: info.height,
      pageUrl,
    };
    await writeFile(join(outDir, 'site.json'), JSON.stringify(site, null, 2));
    const card = cardImage({ info, imageId });
    await makeIcon(join(imageDir, card.path), join(outDir, 'icon.png'));
    await personalisePage(join(outDir, 'index.html'), { site, image: card });

    log(`Done: ${Math.round(bytes / 1024 / 1024)} MB of IIIF files at ${baseUrl}/iiif/`);
    return { baseUrl, pageUrl, manifestId, bytes, droppedFull, image, card, site };
  } finally {
    await rm(downloads, { recursive: true, force: true });
  }
}
