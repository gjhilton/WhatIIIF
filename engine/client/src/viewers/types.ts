import type { Site } from '../site';

/** A viewer adapter renders the IIIF resources into `el` and returns a teardown function. */
export interface ViewerAdapter {
  mount(el: HTMLElement, site: Site): () => void;
}

export interface ViewerEntry {
  label: string;
  /** Lazy, so a viewer's bundle is only downloaded when it is chosen. */
  load: () => Promise<ViewerAdapter>;
}
