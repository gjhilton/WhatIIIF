import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { NotesHelper, type Links, type NotesSource } from './NotesHelper';
import type { Site } from '../site';
import '../colours.css';
import '../styles.css';

/** What the build left for this page: the site, its notes files as written, and where to change them on GitHub. */
async function load(): Promise<{ site: Site; notes?: NotesSource; links: Links }> {
  const json = (file: string) => fetch(`./${file}`).then((response) => (response.ok ? response.json() : Promise.reject(new Error(`${file} answered ${response.status}`))));
  // settings.json may be from a site built before there was a notes helper: the form then starts empty.
  const [site, { notes, notesUrl, uploadUrl, actionsUrl }] = await Promise.all([json('site.json'), json('settings.json').catch(() => ({}))]);
  return { site, notes, links: { notesUrl, uploadUrl, actionsUrl } };
}

const root = createRoot(document.getElementById('root')!);
load().then(
  ({ site, notes, links }) => {
    document.title = `Notes: ${site.title[site.language] ?? Object.values(site.title)[0]}`;
    root.render(
      <StrictMode>
        <NotesHelper site={site} source={notes} links={links} />
      </StrictMode>,
    );
  },
  () => root.render(<p className="load-error">This page could not load the details of its picture (site.json).</p>),
);
