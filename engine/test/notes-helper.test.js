// The notes helper's own logic, apart from React and the picture: reading the notes files into notes to edit,
// writing them back, saying what the build would refuse, and keeping unpublished changes in the browser. Node runs
// the TypeScript as it is, its types stripped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readNotes, writeNotes, problemsOf, loadDraft, saveDraft, clearDraft, sameFiles, newNote } from '../client/src/notes/draft.ts';

const PAGE = 'https://gjh.github.io/harbour/';
const site = { width: 4000, height: 3000, pageUrl: PAGE, language: 'en' };
const OWN = `Look closely.

## [The lighthouse](https://gjh.github.io/harbour/?viewer=openseadragon#xywh=600,300,400,700)

Built in 1846,
and still lit.

## [The boats](#xywh=2400,1800,900,500)
`;
const WELSH = '## Y goleudy\n\nWedi’i adeiladu ym 1846.\n\n## Y cychod\n';
const files = [
  { file: 'notes.md', language: 'en', text: OWN, url: 'https://github.com/gjh/harbour/edit/main/content/notes.md' },
  { file: 'notes.cy.md', language: 'cy', text: WELSH, url: 'https://github.com/gjh/harbour/edit/main/content/notes.cy.md' },
];
const strip = ({ intro, items }) => ({ intro, items: items.map(({ key, ...note }) => note) });

test('the notes files are read as one set of notes, each note’s words in every language, its part from the site’s own file', () => {
  assert.deepEqual(strip(readNotes(files)), {
    intro: { en: 'Look closely.', cy: '' },
    items: [
      { region: { x: 600, y: 300, w: 400, h: 700 }, title: { en: 'The lighthouse', cy: 'Y goleudy' }, text: { en: 'Built in 1846, and still lit.', cy: 'Wedi’i adeiladu ym 1846.' } },
      { region: { x: 2400, y: 1800, w: 900, h: 500 }, title: { en: 'The boats', cy: 'Y cychod' }, text: { en: '', cy: '' } },
    ],
  });
  const [first, second] = readNotes(files).items;
  assert.notEqual(first.key, second.key, 'each note has a key of its own, which stays with it as notes move');
});

test('notes read and written again, unchanged, are the files the site has, though written differently', () => {
  const written = writeNotes(readNotes(files), files, PAGE);
  assert.deepEqual(written.map(({ file, changed }) => [file, changed]), [['notes.md', false], ['notes.cy.md', false]]);
  assert.match(written[0].text, /^## \[The lighthouse\]\(https:\/\/gjh\.github\.io\/harbour\/#xywh=600,300,400,700\)$/m);
  assert.equal(written[1].text, WELSH, 'a translation’s headings need no links');
  assert.equal(written[1].url, files[1].url);
});

test('a note moved, removed or added moves its words in every language with it, and changes every file', () => {
  const notes = readNotes(files);
  const moved = { ...notes, items: [notes.items[1], notes.items[0]] };
  const written = writeNotes(moved, files, PAGE);
  assert.deepEqual(written.map(({ changed }) => changed), [true, true]);
  assert.match(written[1].text, /^## Y cychod\n\n## Y goleudy\n\nWedi’i adeiladu ym 1846\.\n$/);

  const one = writeNotes({ ...notes, items: [{ ...notes.items[0], text: { ...notes.items[0].text, en: 'Still lit.' } }, notes.items[1]] }, files, PAGE);
  assert.deepEqual(one.map(({ changed }) => changed), [true, false], 'a change in one language changes only its file');
});

test('a site with no notes yet has notes.md to make', () => {
  const none = readNotes([{ file: 'notes.md', language: 'en', text: '' }]);
  assert.deepEqual(strip(none), { intro: { en: '' }, items: [] });
  const added = { ...none, items: [{ key: 1, region: { x: 0, y: 0, w: 800, h: 600 }, title: { en: 'The middle' }, text: { en: '' } }] };
  const [written] = writeNotes(added, [{ file: 'notes.md', language: 'en', text: '' }], PAGE);
  assert.deepEqual([written.file, written.text, written.changed], ['notes.md', `## [The middle](${PAGE}#xywh=0,0,800,600)\n`, true]);
});

test('whatever the build would refuse is said, note by note, so the helper can take the owner to it', () => {
  const notes = readNotes(files);
  const [lighthouse, boats] = notes.items;
  const wrong = {
    intro: { en: '## Hello', cy: '' },
    items: [
      { ...lighthouse, title: { en: ' ', cy: 'Y goleudy' } },
      { ...boats, region: undefined, title: { en: 'The boats', cy: '' }, text: { en: 'Red.\n\n## Sails', cy: '' } },
      { key: 99, region: { x: 3900, y: 2900, w: 200, h: 200 }, title: { en: 'Off the edge', cy: 'Oddi ar yr ymyl' }, text: {} },
    ],
  };
  assert.deepEqual(problemsOf(wrong, files, site), [
    { key: 'intro', message: 'The introduction has a heading made with ##, which would start a note of its own: use ### for a heading within it.' },
    { key: lighthouse.key, message: 'Note 1 needs a title.' },
    { key: boats.key, message: 'Note 2 needs a part of the picture.' },
    { key: boats.key, message: 'Note 2 has a heading made with ##, which would start a note of its own: use ### for a heading within a note.' },
    { key: boats.key, message: 'Note 2 needs a title in Welsh, for notes.cy.md.' },
    { key: 99, message: 'Note 3’s part runs off the picture: mark it again.' },
  ]);
  assert.deepEqual(problemsOf(notes, files, site), []);
});

test('removing every note is not how to have none: notes.md is deleted for that', () => {
  assert.deepEqual(problemsOf({ intro: { en: '', cy: '' }, items: [] }, files, site), [{ message: 'There are no notes. To have none, delete notes.md and notes.cy.md instead.' }]);
  assert.deepEqual(problemsOf({ intro: { en: '' }, items: [] }, [{ file: 'notes.md', language: 'en', text: '' }], site), [], 'a site that never had notes has nothing to fix');
});

test('the site is known to have the notes copied from the helper once it is rebuilt, however the file was saved', () => {
  const written = writeNotes(readNotes(files), files, PAGE).map(({ text }) => text);
  assert.equal(sameFiles(files, written), true, 'the same notes, written differently');
  assert.equal(sameFiles(files.map((file) => ({ ...file, text: file.text.replace(/\n/g, '\r\n') })), written), true, 'with Windows line endings');
  assert.equal(sameFiles(files, [written[0].replace('still lit', 'dark'), written[1]]), false);
  assert.equal(sameFiles(files.slice(0, 1), written), false, 'a file fewer');
});

test('a new note has a key of its own, and nothing in it but the part it was given', () => {
  const [a, b] = [newNote({ x: 1, y: 2, w: 3, h: 4 }), newNote()];
  assert.notEqual(a.key, b.key);
  assert.deepEqual([a.region, a.title, a.text, b.region], [{ x: 1, y: 2, w: 3, h: 4 }, {}, {}, undefined]);
});

/** A browser's storage, or one that refuses, as a private window's can. */
const storage = () => {
  const kept = new Map();
  return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, String(value)), removeItem: (key) => kept.delete(key), kept };
};
const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };

test('changes not yet published are kept in the browser, for each site apart, with the files they began from', () => {
  const kept = storage();
  const notes = readNotes(files);
  assert.equal(saveDraft(kept, PAGE, notes, [OWN, WELSH], 1000), true);
  const draft = loadDraft(kept, PAGE);
  assert.deepEqual(strip(draft.notes), strip(notes));
  assert.deepEqual([draft.begun, draft.saved], [[OWN, WELSH], 1000]);
  assert.equal(loadDraft(kept, 'https://gjh.github.io/other/'), undefined, 'another site of the same owner’s keeps its own');
  clearDraft(kept, PAGE);
  assert.equal(loadDraft(kept, PAGE), undefined);
});

test('a browser that will not keep anything loses nothing but the draft, and says so', () => {
  assert.equal(saveDraft(refusing, PAGE, readNotes(files), [OWN, WELSH], 1000), false);
  assert.equal(loadDraft(refusing, PAGE), undefined);
  assert.doesNotThrow(() => clearDraft(refusing, PAGE));
  const kept = storage();
  kept.setItem(`whatiiif notes: ${PAGE}`, '{not json');
  assert.equal(loadDraft(kept, PAGE), undefined, 'a draft that cannot be read is no draft');
});
