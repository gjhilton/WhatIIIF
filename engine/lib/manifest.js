const lang = (text) => ({ en: [text] });

/** Builds a Presentation API 3.0 manifest wrapping the static image service. */
export function buildManifest({ manifestId, imageId, info, config, hasFull, originalUrl }) {
  const { width, height } = info;
  const sizes = info.sizes ?? [];
  const url = (size) => `${imageId}/full/${size}/0/default.jpg`;

  // With full/max unpublished the largest listed size stands in for the painted image.
  const largest = sizes[sizes.length - 1];
  const painted = hasFull || !largest ? { size: 'max', width, height } : { size: `${largest.width},${largest.height}`, ...largest };
  const smallest = sizes[0];
  const service = [{ id: imageId, type: 'ImageService3', profile: 'level0' }];

  const canvasId = `${manifestId.replace(/\/manifest\.json$/, '')}/canvas/1`;
  const manifest = {
    '@context': 'http://iiif.io/api/presentation/3/context.json',
    id: manifestId,
    type: 'Manifest',
    label: lang(config.title),
    ...(config.summary && { summary: lang(config.summary) }),
    ...(config.attribution && {
      requiredStatement: { label: lang('Attribution'), value: lang(config.attribution) },
    }),
    ...(config.rights && { rights: config.rights }),
    ...(config.metadata?.length && {
      metadata: config.metadata.map(({ label, value }) => ({ label: lang(label), value: lang(value) })),
    }),
    thumbnail: [
      {
        id: smallest ? url(`${smallest.width},${smallest.height}`) : url(painted.size),
        type: 'Image',
        format: 'image/jpeg',
        service,
      },
    ],
    ...(originalUrl && { rendering: [{ id: originalUrl, type: 'Image', label: lang('Original file') }] }),
    items: [
      {
        id: canvasId,
        type: 'Canvas',
        width,
        height,
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
  return manifest;
}
