import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadSite, type Site } from './site';
import { darkPage } from './colours';
import './colours.css';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

/**
 * The page as a preview of the notes being written in the notes helper, which opens it with ?notes-draft: shown
 * afresh whenever the owner comes back to it from the helper, as the notes may have changed meanwhile.
 */
async function preview(site: Site) {
  const { withDraft, PreviewBanner } = await import('./notes/preview');
  let shown: number | undefined | null = null;
  const show = () => {
    const { site: drafted, saved } = withDraft(site);
    if (saved === shown) return;
    shown = saved;
    root.render(
      <StrictMode>
        <PreviewBanner saved={saved} />
        <App key={saved} site={drafted} />
      </StrictMode>,
    );
  };
  show();
  addEventListener('focus', show);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && show());
}

loadSite().then(
  (site) => {
    // A background of the owner's own holds in light and dark mode alike, so the browser's own parts (scroll bars,
    // for one) follow it, not the computer's setting.
    if (site.colours?.paper) document.documentElement.style.colorScheme = darkPage() ? 'dark' : 'light';
    if (new URLSearchParams(location.search).has('notes-draft')) return preview(site);
    root.render(
      <StrictMode>
        <App site={site} />
      </StrictMode>,
    );
  },
  () => root.render(<p className="load-error">This page could not load the details of its image (site.json).</p>),
);
