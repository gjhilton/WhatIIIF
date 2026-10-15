// The notes helper's notes, apart from React and the picture: read from the notes files the site was built from,
// written back to them, checked as the build will check them, and kept in the browser until they are published.
import { combineNotes, readNotesSource, writeNotesSource } from '../../../lib/notes.js';
import type { Region } from '../address';

/** A language's name in English, the helper's own language, such as Welsh for cy. */
export function languageName(language: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(language) ?? language;
  } catch {
    return language;
  }
}

/** One text in each language the notes are written in, in Markdown. */
export type Words = Record<string, string>;

/** A note being written; `key` stays with it as notes are added, moved and removed. */
export interface Note {
  key: number;
  region?: Region;
  title: Words;
  text: Words;
}

export interface Notes {
  intro: Words;
  items: Note[];
}

/** A notes file as the site was built from it: notes.md in the site's own language, or a translation. */
export interface NotesFile {
  file: string;
  language: string;
  text: string;
  /** Where to change it on GitHub. */
  url?: string;
}

/** A notes file written from the notes, and whether its notes differ from those the site has. */
export interface Written extends NotesFile {
  changed: boolean;
}

/** Something the build would refuse, and the note it is about, if any, so the helper can take the owner there. */
export interface Problem {
  key?: number | 'intro';
  message: string;
}

let keys = 0;

/** The notes in `files`, the site's own first: each note's part comes from it, and its words from every file. */
export function readNotes(files: NotesFile[]): Notes {
  const read = files.map(({ language, text }) => ({ language, ...readNotesSource(text) }));
  const [own] = read;
  const each = (pick: (notes: (typeof read)[number]) => string | undefined): Words => Object.fromEntries(read.map((notes) => [notes.language, pick(notes) ?? '']));
  return {
    intro: each((notes) => notes.intro),
    items: own.items.map(({ region }, i) => ({
      key: keys++,
      region,
      title: each((notes) => notes.items[i]?.title),
      text: each((notes) => notes.items[i]?.text),
    })),
  };
}

/** A note with nothing in it yet, but the part of the picture it was given, if any. */
export const newNote = (region?: Region): Note => ({ key: keys++, region, title: {}, text: {} });

/** The notes as the files the build reads, each heading of the site's own linking to its part on the page at `pageUrl`. */
function sourceOf(notes: Notes, language: string, own: boolean, pageUrl: string): string {
  const items = notes.items.map(({ region, title, text }) => ({ region: own ? region : undefined, title: title[language] ?? '', text: text[language] ?? '' }));
  return writeNotesSource({ intro: notes.intro[language] ?? '', items }, pageUrl);
}

/** Whether two notes files hold the same notes, however they are written; a translation's parts are the site's. */
function same(a: string, b: string, own: boolean): boolean {
  const read = (text: string) => {
    const { intro, items } = readNotesSource(text);
    return JSON.stringify({ intro, items: items.map(({ title, region, text: words }) => ({ title, text: words, ...(own && { region }) })) });
  };
  return read(a) === read(b);
}

/** Whether the site's notes `files` are the notes in `texts`, file by file, however each was written and saved. */
export function sameFiles(files: NotesFile[], texts: string[]): boolean {
  return files.length === texts.length && files.every(({ text }, i) => same(text, texts[i], i === 0));
}

/** Every file, written from `notes`, and which of them differ from what the site has. */
export function writeNotes(notes: Notes, files: NotesFile[], pageUrl: string): Written[] {
  return files.map((file, i) => {
    const text = sourceOf(notes, file.language, i === 0, pageUrl);
    return { ...file, text, changed: !same(text, file.text, i === 0) };
  });
}

/** Whether Markdown has a ## heading in it, which in a notes file would start a note of its own. */
const startsNotes = (text = '') => readNotesSource(text).items.length > 0;

/** What the build would refuse in the notes, in the order the owner meets it on the page. */
export function problemsOf(notes: Notes, files: NotesFile[], site: { width: number; height: number; pageUrl: string }): Problem[] {
  const [own, ...translations] = files;
  const problems: Problem[] = [];
  if (notes.items.length === 0) {
    // A site that has notes is told how to have none; one that never had any has nothing to publish.
    if (own.text.trim()) problems.push({ message: `There are no notes. To have none, delete ${files.map(({ file }) => file).join(' and ')} instead.` });
    return problems;
  }
  const heading = 'a heading made with ##, which would start a note of its own: use ###';
  for (const { language } of files) {
    if (startsNotes(notes.intro[language])) {
      const which = language === own.language ? 'The introduction' : `The introduction in ${languageName(language)}`;
      problems.push({ key: 'intro', message: `${which} has ${heading} for a heading within it.` });
    }
  }
  for (const [i, { key, region, title, text }] of notes.items.entries()) {
    const note = `Note ${i + 1}`;
    if (!title[own.language]?.trim()) problems.push({ key, message: `${note} needs a title.` });
    if (!region) problems.push({ key, message: `${note} needs a part of the picture.` });
    else if (region.x + region.w > site.width || region.y + region.h > site.height) problems.push({ key, message: `${note}’s part runs off the picture: mark it again.` });
    if (startsNotes(text[own.language])) problems.push({ key, message: `${note} has ${heading} for a heading within a note.` });
    for (const { file, language } of translations) {
      const name = languageName(language);
      if (!title[language]?.trim()) problems.push({ key, message: `${note} needs a title in ${name}, for ${file}.` });
      if (startsNotes(text[language])) problems.push({ key, message: `${note}’s text in ${name} has ${heading} for a heading within a note.` });
    }
  }
  if (problems.length) return problems;
  // Anything else the build would say, in its own words.
  try {
    const written = writeNotes(notes, files, site.pageUrl);
    combineNotes(Object.fromEntries(written.map(({ file, language, text }) => [language, { file, text }])), own.language);
  } catch (error) {
    problems.push({ message: (error as Error).message });
  }
  return problems;
}

/** Changes not yet published, kept in the browser: the notes, the files they began from, and when they were kept. */
export interface Draft {
  notes: Notes;
  begun: string[];
  saved: number;
}

// One draft for each site: an owner's sites share their browser storage, at OWNER.github.io.
const draftKey = (pageUrl: string) => `whatiiif notes: ${pageUrl}`;

/**
 * Keeps `notes` for the site at `pageUrl`, with `begun`, the texts of the files they began from; false if the browser
 * will not keep them (in a private window, say).
 */
export function saveDraft(storage: Pick<Storage, 'setItem'>, pageUrl: string, notes: Notes, begun: string[], now = Date.now()): boolean {
  const kept = { notes: { intro: notes.intro, items: notes.items.map(({ key, ...note }) => note) }, begun, saved: now };
  try {
    storage.setItem(draftKey(pageUrl), JSON.stringify(kept));
    return true;
  } catch {
    return false;
  }
}

/** The changes kept for the site at `pageUrl`, if there are any that can be read. */
export function loadDraft(storage: Pick<Storage, 'getItem'>, pageUrl: string): Draft | undefined {
  try {
    const kept = JSON.parse(storage.getItem(draftKey(pageUrl)) ?? 'null');
    if (!kept?.notes?.items || !Array.isArray(kept.begun)) return undefined;
    return { ...kept, notes: { intro: kept.notes.intro ?? {}, items: kept.notes.items.map((note: Omit<Note, 'key'>) => ({ ...note, key: keys++ })) } };
  } catch {
    return undefined;
  }
}

export function clearDraft(storage: Pick<Storage, 'removeItem'>, pageUrl: string): void {
  try {
    storage.removeItem(draftKey(pageUrl));
  } catch {
    // Nothing was kept, then.
  }
}
