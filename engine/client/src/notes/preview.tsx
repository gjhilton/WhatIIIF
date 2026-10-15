// The site's page as a preview of the notes being written in the notes helper, before they are published: the
// helper keeps them in the browser, and the page, opened with ?notes-draft, shows them in place of the site's own.
import type { MouseEvent } from 'react';
import type { Site } from '../site';
import { loadDraft, previewOf } from './draft';

/**
 * `site` with the notes kept by the notes helper, as the build would make them; as it is if there are none.
 * `version` changes whenever they do.
 */
export function withDraft(site: Site): { site: Site; drafted: boolean; version: string } {
  let draft;
  try {
    draft = loadDraft(localStorage, site.pageUrl);
  } catch {
    // A browser that keeps nothing has no draft to show.
  }
  if (!draft) return { site, drafted: false, version: '' };
  return { site: { ...site, notes: previewOf(draft.notes, site.language, site.pageUrl) }, drafted: true, version: JSON.stringify(draft) };
}

/**
 * Back to the helper that opened this preview, closing it, rather than a second helper in its place: two would each
 * keep their own changes over the other's.
 */
function back(event: MouseEvent) {
  try {
    if (!opener || opener.closed || opener.location.origin !== location.origin) return;
  } catch {
    return; // a page elsewhere opened this one
  }
  event.preventDefault();
  opener.focus();
  close();
  setTimeout(() => location.assign('notes.html'), 300); // the browser would not close it
}

/** Says, above the page, that it is a preview, and leads back to the helper. */
export function PreviewBanner({ drafted }: { drafted: boolean }) {
  return (
    <p className="preview-banner" role="status">
      {drafted
        ? 'A preview of the notes you are writing, which are not on your site yet: its visitors still see the notes it has.'
        : 'A preview of the notes helper’s changes, but there are none: these are the notes your site has.'}{' '}
      <a href="notes.html" onClick={back}>Back to the notes helper</a>
    </p>
  );
}
