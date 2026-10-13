import { useEffect, useRef, useState } from 'react';
import { viewers } from '../viewers';
import type { Site, ViewerId } from '../site';

/** Mounts the chosen viewer adapter into a fresh container and tears it down on change. */
export function ViewerPane({ site, viewer }: { site: Site; viewer: ViewerId }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | undefined;
    const el = document.createElement('div');
    el.className = 'viewer-surface';
    host.current?.replaceChildren(el);
    setError(undefined);

    viewers[viewer]
      .load()
      .then((adapter) => {
        if (!cancelled) teardown = adapter.mount(el, site);
      })
      .catch((e: Error) => setError(`Could not load ${viewers[viewer].label}: ${e.message}`));

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [site, viewer]);

  return (
    <div className="viewer" ref={host} role="region" aria-label="Image viewer">
      {error && <p className="viewer-error">{error}</p>}
    </div>
  );
}
