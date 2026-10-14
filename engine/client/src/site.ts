export type ViewerId = 'openseadragon' | 'mirador';

/** Everything the page knows about the image. Written next to the page by engine/build.js. */
export interface Site {
  title: string;
  summary?: string;
  attribution?: string;
  rights?: string;
  metadata: { label: string; value: string }[];
  /** HTML made from content/description.md when the site was built. */
  description?: string;
  viewer: ViewerId;
  manifestUrl: string;
  infoUrl: string;
  fullUrl?: string;
  originalUrl?: string;
  width: number;
  height: number;
}

/** Loaded when the page opens, so the same built page serves any image. */
export async function loadSite(): Promise<Site> {
  const response = await fetch('./site.json');
  if (!response.ok) throw new Error(`site.json answered ${response.status}`);
  return response.json();
}
