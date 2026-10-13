import OpenSeadragon from 'openseadragon';
import type { ViewerAdapter } from './types';

const adapter: ViewerAdapter = {
  mount(el, site) {
    const viewer = OpenSeadragon({
      element: el,
      prefixUrl: `${import.meta.env.BASE_URL}osd-images/`,
      tileSources: site.infoUrl,
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      gestureSettingsMouse: { clickToZoom: false },
    });
    return () => viewer.destroy();
  },
};

export default adapter;
