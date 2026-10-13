import generated from './generated/site.json';

export type ViewerId = 'openseadragon' | 'mirador';

/** Written by engine/build.js from content/ and baked into the bundle at build time. */
export interface Site {
  title: string;
  summary?: string;
  attribution?: string;
  rights?: string;
  metadata: { label: string; value: string }[];
  description?: string;
  viewer: ViewerId;
  manifestUrl: string;
  infoUrl: string;
  fullUrl?: string;
  originalUrl?: string;
  width: number;
  height: number;
}

export const site = generated as Site;
