import type { ViewerAdapter } from './types';

interface MiradorInstance {
  unmount?: () => void;
}

const adapter: ViewerAdapter = {
  mount(el, site) {
    let instance: MiradorInstance | undefined;
    let cancelled = false;
    el.id = 'mirador-root';

    import('mirador').then(({ default: Mirador }) => {
      if (cancelled) return;
      instance = Mirador.viewer({
        id: el.id,
        windows: [{ manifestId: site.manifestUrl, maximized: true }], // fill the pane; there is only ever one window
        window: { allowClose: false, allowMaximize: false, sideBarOpen: false },
        workspace: { isWorkspaceAddVisible: false },
        workspaceControlPanel: { enabled: false },
      }) as MiradorInstance;
    });

    return () => {
      cancelled = true;
      instance?.unmount?.();
    };
  },
};

export default adapter;
