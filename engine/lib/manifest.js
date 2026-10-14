// IIIF language maps: each language's text in an array. `text` is one of the config's language maps.
const languageMap = (text) => Object.fromEntries(Object.entries(text).map(([language, words]) => [language, [words]]));
const english = (words) => ({ en: [words] }); // our own words, not the site author's

/** Who made it, when, and how big it is, under labels of our own, then the owner's own metadata. */
function metadataOf({ creator, date, dimensions, metadata = [] }) {
  return [
    creator && { label: english('Creator'), value: languageMap(creator) },
    date && { label: english('Date'), value: languageMap(date) },
    dimensions && { label: english('Dimensions'), value: { none: [dimensions.text] } },
    ...metadata.map(({ label, value }) => ({ label: languageMap(label), value: languageMap(value) })),
  ].filter(Boolean);
}

/**
 * IIIF's physical dimensions service: how much of the original one pixel of the picture covers, in mm, cm or in
 * (metres given as centimetres), so a viewer can measure.
 */
function physicalDimensions(canvasId, dimensions, pixelWidth) {
  const [length, unit] = dimensions.unit === 'm' ? [dimensions.width * 100, 'cm'] : [dimensions.width, dimensions.unit];
  return { id: `${canvasId}/physdim`, type: 'PhysicalDimensions', profile: 'http://iiif.io/api/annex/services/physdim', physicalScale: length / pixelWidth, physicalUnits: unit };
}

/**
 * A Presentation API 3.0 manifest painting the static image service on one canvas, linking back to the page at
 * `pageUrl` and, if `original` gives its address and media type, to the file the image was made from.
 */
export function buildManifest({ manifestId, imageId, pageUrl, info, config, hasFull, original }) {
  const { width, height } = info;
  const sizes = info.sizes ?? [];
  const url = (size) => `${imageId}/full/${size}/0/default.jpg`;

  // With full/max unpublished the largest listed size stands in for the painted image.
  const largest = sizes[sizes.length - 1];
  const painted = hasFull || !largest ? { size: 'max', width, height } : { size: `${largest.width},${largest.height}`, ...largest };
  const smallest = sizes[0];
  const service = [{ id: imageId, type: 'ImageService3', profile: 'level0' }];

  const canvasId = `${manifestId.replace(/\/manifest\.json$/, '')}/canvas/1`;
  const metadata = metadataOf(config);
  return {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: manifestId,
    type: 'Manifest',
    label: languageMap(config.title),
    ...(config.summary && { summary: languageMap(config.summary) }),
    ...(config.attribution && {
      requiredStatement: { label: english('Attribution'), value: languageMap(config.attribution) },
    }),
    ...(config.rights && { rights: config.rights }),
    ...(metadata.length && { metadata }),
    homepage: [{ id: pageUrl, type: 'Text', label: languageMap(config.title), format: 'text/html' }],
    thumbnail: [
      {
        id: smallest ? url(`${smallest.width},${smallest.height}`) : url(painted.size),
        type: 'Image',
        format: 'image/jpeg',
        service,
      },
    ],
    ...(original && { rendering: [{ id: original.url, type: 'Image', label: english('Original file'), format: original.format }] }),
    items: [
      {
        id: canvasId,
        type: 'Canvas',
        label: languageMap(config.title),
        width,
        height,
        ...(config.dimensions && { service: [physicalDimensions(canvasId, config.dimensions, width)] }),
        items: [
          {
            id: `${canvasId}/page`,
            type: 'AnnotationPage',
            items: [
              {
                id: `${canvasId}/page/image`,
                type: 'Annotation',
                motivation: 'painting',
                target: canvasId,
                body: {
                  id: url(painted.size),
                  type: 'Image',
                  format: 'image/jpeg',
                  width: painted.width,
                  height: painted.height,
                  service,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
