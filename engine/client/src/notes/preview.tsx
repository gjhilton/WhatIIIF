// The site's page as a preview of the notes being written in the notes helper, before they are published: the
// helper keeps them in the browser, and the page, opened with ?notes-draft, shows them in place of the site's own.
import { previewNotes } from '../../../lib/notes.js';
import type { Site } from '../site';
import { loadDraft } from './draft';

/** `site` with the notes kept by the notes helper, and when they were kept; as it is if there are none. */
export function withDraft(site: Site): { site: Site; saved?: number } {
  let draft;
  try {
    draft = loadDraft(localStorage, site.pageUrl);
  } catch {
    // A browser that keeps nothing has no draft to show.
  }
  if (!draft) return { site };
  return { site: { ...site, notes: previewNotes(draft.notes, site.language) }, saved: draft.saved };
}

/** Says, above the page, that it is a preview, and leads back to the helper. */
export function PreviewBanner({ saved }: { saved?: number }) {
  return (
    <p className="preview-banner" role="status">
      {saved === undefined
        ? 'A preview of the notes helper’s changes, but there are none: these are the notes your site has.'
        : 'A preview of the notes you are writing, which are not on your site yet: its visitors still see the notes it has.'}{' '}
      <a href="notes.html">Back to the notes helper</a>
    </p>
  );
}
