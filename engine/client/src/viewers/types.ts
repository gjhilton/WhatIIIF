import type { Site } from '../site';

export interface MountOptions {
  /** The language the visitor reads the page in; viewers with their own interface use it too. */
  language: string;
}

/** A viewer adapter renders the IIIF resources into `el` and returns a teardown function. */
export interface ViewerAdapter {
  mount(el: HTMLElement, site: Site, options: MountOptions): () => void;
}

export interface ViewerEntry {
  label: string;
  /** Lazy, so a viewer's bundle is only downloaded when it is chosen. */
  load: () => Promise<ViewerAdapter>;
}
