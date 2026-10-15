// The notes helper: writes content/notes.md, the notes on the picture and the tour through them. The picture stays
// beside the notes, each note's part outlined and numbered on it; the note being written can have its part marked
// by the view on screen, by drawing round it, or by dragging its outline. Changes are kept in the browser until
// they are on the site, and can be previewed on the site's own page. The helper cannot change the site itself: the
// owner pastes what it writes into the file on GitHub, and it watches for the site to have them.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Region } from '../address';
import { htmlLang } from '../language';
import type { Site } from '../site';
import { openPicture, type Picture } from './picture';
import { clearDraft, languageName, loadDraft, newNote, problemsOf, readNotes, saveDraft, sameFiles, writeNotes, type Note, type NotesFile, type Problem, type Written } from './draft';

/** The notes files as the build left them for the helper, in settings.json, the site's own first. */
export interface NotesSource extends NotesFile {
  translations: NotesFile[];
}

/** Where on GitHub the notes are changed, and their changes seen being built. */
export interface Links {
  notesUrl?: string;
  uploadUrl?: string;
  actionsUrl?: string;
}

const DEMO = 'https://gjhilton.github.io/whatiiif-demo-notes/';
const WATCH_EVERY = 10_000; // how often to look for the site's new notes, once they have been copied
const LATE = 10 * 60_000; // when to say a build may have stopped

const pixels = (n: number) => n.toLocaleString('en-GB');
/** Where a note's part is, and how to change it; a part that is the whole picture is most likely a slip. */
const describe = ({ x, y, w, h }: Region, { width, height }: Site) =>
  x === 0 && y === 0 && w === width && h === height
    ? 'The whole picture. To point at a part of it, zoom in and choose Use the part in view, or draw round it.'
    : `${pixels(w)} × ${pixels(h)} pixels, ${pixels(x)} across and ${pixels(y)} down. On the picture, drag its number to move it, or a corner to change its size.`;
const filesOf = (source: NotesSource | undefined, language: string): NotesFile[] =>
  source ? [source, ...source.translations] : [{ file: 'notes.md', language, text: '' }];
const when = (time: number) => new Date(time).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const browserStorage = (): Storage | undefined => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The notes as the browser kept them, if there are changes not yet on the site, else as the site has them. */
function startingNotes(storage: Storage | undefined, files: NotesFile[], pageUrl: string) {
  const texts = files.map(({ text }) => text);
  const draft = storage && loadDraft(storage, pageUrl);
  if (!draft || writeNotes(draft.notes, files, pageUrl).every(({ changed }) => !changed)) return { notes: readNotes(files), begun: texts };
  // Stale: the site's notes have changed since these changes began, on GitHub perhaps, and these would undo that.
  const stale = draft.begun.length !== texts.length || draft.begun.some((text, i) => text !== texts[i]);
  return { notes: draft.notes, begun: draft.begun, restored: { saved: draft.saved, stale } };
}

export function NotesHelper({ site, source, links: built }: { site: Site; source?: NotesSource; links: Links }) {
  const storage = useMemo(browserStorage, []);
  const [files, setFiles] = useState(() => filesOf(source, site.language));
  const [links, setLinks] = useState(built);
  const [own, ...translations] = files;
  const [start] = useState(() => startingNotes(storage, files, site.pageUrl));
  const [notes, setNotes] = useState(start.notes);
  const [begun, setBegun] = useState(start.begun); // the files these changes began from
  const [restored, setRestored] = useState(start.restored);
  const [selected, setSelected] = useState<number | 'intro'>(); // the open note's key, or the introduction
  const [fresh, setFresh] = useState<number>(); // a note just added, whose problems wait until it is closed
  const [drawing, setDrawing] = useState<number | 'new'>(); // the note whose part is being drawn
  const [removed, setRemoved] = useState<{ note: Note; at: number }>();
  const [kept, setKept] = useState(true); // whether the browser keeps the changes
  const [copied, setCopied] = useState<boolean>(); // false: the browser would not copy
  const [watch, setWatch] = useState<{ expecting: string[]; since: number; late?: boolean; arrived?: boolean }>();
  const { items } = notes;
  const lang = (language: string) => htmlLang(language);

  const written = writeNotes(notes, files, site.pageUrl);
  const changed = written.filter((file) => file.changed);
  const problems = problemsOf(notes, files, site);

  // Changes are kept in the browser as they are made, and forgotten once the site has them.
  const save = () => {
    if (!storage) return setKept(false);
    if (changed.length === 0) clearDraft(storage, site.pageUrl);
    else setKept(saveDraft(storage, site.pageUrl, notes, begun));
  };
  const saveSoon = useRef(save);
  saveSoon.current = save;
  useEffect(() => {
    const timer = setTimeout(() => saveSoon.current(), 300);
    return () => clearTimeout(timer);
  }, [notes, files, begun]);
  // A browser that will not keep them warns before they are lost.
  const unsaved = !kept && changed.length > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = ''; // as older browsers ask
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // The picture, which numbers the notes as the list does.
  const host = useRef<HTMLDivElement>(null);
  const picture = useRef<Picture>(undefined);
  const current = useRef(items);
  current.current = items;
  const [reveal, setReveal] = useState<string>(); // the id of a line in the list to scroll to, as a note is chosen elsewhere
  useEffect(() => {
    picture.current = openPicture(host.current!, site, {
      onChoose: (i) => {
        const key = current.current[i]?.key;
        setSelected(key);
        setReveal(`note-${key}`);
      },
      onAdjust: (i, region) => {
        const key = current.current[i]?.key;
        if (key === undefined) return;
        setNotes((now) => ({ ...now, items: now.items.map((note) => (note.key === key ? { ...note, region } : note)) }));
        setSelected(key);
      },
    });
    return () => picture.current?.destroy();
  }, [site]);
  const regions = JSON.stringify(items.map(({ region }) => region));
  const index = items.findIndex((note) => note.key === selected);
  const open = items[index] as Note | undefined;
  useEffect(() => picture.current?.mark(JSON.parse(regions), index < 0 ? undefined : index), [regions, index]);
  useEffect(() => {
    if (reveal === undefined) return;
    // Its line, not the note as a whole, which when open may be taller than the list's window onto it.
    const row = document.getElementById(reveal)?.querySelector<HTMLElement>('.note-row');
    row?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'nearest' });
    row?.querySelector<HTMLElement>('.note-row-button')?.focus({ preventScroll: true });
    setReveal(undefined);
  }, [reveal]);
  // A note just added has its title typed next.
  const [added, setAdded] = useState<number>();
  useEffect(() => {
    if (added === undefined) return;
    document.getElementById(`note-title-${added}`)?.focus();
    setAdded(undefined);
  }, [added]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(undefined), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  // Once the notes are copied, the site is watched until it has them.
  useEffect(() => {
    if (!watch || watch.arrived) return;
    const look = async () => {
      const latest = await fetch(`./settings.json?${Date.now()}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : undefined))
        .catch(() => undefined);
      const now: NotesFile[] | undefined = latest && filesOf(latest.notes, site.language);
      if (now && sameFiles(now, watch.expecting)) {
        setFiles(now);
        setBegun(now.map(({ text }) => text));
        setLinks({ notesUrl: latest.notesUrl, uploadUrl: latest.uploadUrl, actionsUrl: latest.actionsUrl });
        setRestored(undefined);
        setWatch({ ...watch, arrived: true });
      } else if (!watch.late && Date.now() - watch.since > LATE) {
        setWatch({ ...watch, late: true });
      }
    };
    const timer = setInterval(look, WATCH_EVERY);
    return () => clearInterval(timer);
  }, [watch, site.language]);
  /** Watches for the site to have `published`, the files copied or downloaded, and the rest as they are. */
  const watchFor = (published: Written[]) => setWatch({ expecting: written.map((file) => published.find(({ file: name }) => name === file.file)?.text ?? file.text), since: Date.now() });

  const change = (key: number, fields: Partial<Note>) => setNotes((now) => ({ ...now, items: now.items.map((note) => (note.key === key ? { ...note, ...fields } : note)) }));
  const words = (key: number, field: 'title' | 'text', language: string, value: string) =>
    setNotes((now) => ({ ...now, items: now.items.map((note) => (note.key === key ? { ...note, [field]: { ...note[field], [language]: value } } : note)) }));
  /**
   * Opens a note (or closes it), moving the picture to its part when asked, and on a narrow screen, where the picture
   * is above the notes, scrolling up to it when asked to show it there.
   */
  const choose = (key: number | 'intro' | undefined, { show = false, scroll = false } = {}) => {
    if (key !== fresh) setFresh(undefined);
    setSelected(key);
    const note = items.find((item) => item.key === key);
    if (show && note?.region) {
      if (scroll) bringIntoView();
      picture.current?.show(note.region);
    }
  };
  const add = (region?: Region) => {
    const note = newNote(region);
    setNotes((now) => ({ ...now, items: [...now.items, note] }));
    setRemoved(undefined);
    setSelected(note.key);
    setFresh(note.key);
    setAdded(note.key);
  };
  const move = (key: number, by: number) =>
    setNotes((now) => {
      const [i, next] = [now.items.findIndex((note) => note.key === key), [...now.items]];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return { ...now, items: next };
    });
  const remove = (key: number) => {
    const at = items.findIndex((note) => note.key === key);
    setRemoved({ note: items[at], at });
    setNotes((now) => ({ ...now, items: now.items.filter((note) => note.key !== key) }));
    if (selected === key) setSelected(undefined);
  };
  const undoRemove = () => {
    if (!removed) return;
    setNotes((now) => ({ ...now, items: [...now.items.slice(0, removed.at), removed.note, ...now.items.slice(removed.at)] }));
    setSelected(removed.note.key);
    setRemoved(undefined);
  };
  const startAgain = () => {
    if (!confirm('Forget the changes you made, and start again from the notes your site has?')) return;
    setNotes(readNotes(files));
    setBegun(files.map(({ text }) => text));
    setRestored(undefined);
    setSelected(undefined);
    setRemoved(undefined);
  };
  const inView = () => picture.current?.inView();
  /** Scrolls the picture onto the screen, where a narrow screen has the notes below it. */
  const bringIntoView = () => host.current?.closest('.notes-picture')?.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'nearest' });
  /** Lets the next drag across the picture mark the part of the note with `key`, or of a new note. */
  const draw = (key: number | 'new') => {
    if (key !== 'new') setSelected(key);
    setDrawing(key);
    bringIntoView();
    picture.current?.draw(
      (region) => {
        setDrawing(undefined);
        if (key === 'new') add(region);
        else change(key, { region });
      },
      () => setDrawing(undefined),
    );
  };
  const stopDrawing = () => {
    picture.current?.stopDrawing();
    setDrawing(undefined);
  };
  const copy = (file: Written) =>
    navigator.clipboard.writeText(file.text).then(
      () => {
        setCopied(true);
        watchFor([file]);
      },
      () => setCopied(false),
    );
  const download = () => {
    for (const file of changed) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([file.text], { type: 'text/markdown' }));
      link.download = file.file;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
    watchFor(changed);
  };

  const problemsFor = (key: number | 'intro') => (key === fresh ? [] : problems.filter((problem) => problem.key === key));
  const numberOf = (key?: number) => items.findIndex((note) => note.key === key) + 1;
  const title = site.title[site.language] ?? Object.values(site.title)[0];
  const shape = { '--shape': site.width / site.height } as CSSProperties;

  return (
    <div className="settings notes-helper">
      <header className="masthead">
        <div>
          <h1>Notes</h1>
          <p>{title}</p>
        </div>
      </header>
      <div className="notes-workspace">
        <section className="notes-picture" aria-label="The picture">
          <div className="viewer" style={shape} aria-describedby="picture-hint">
            <div className="viewer-host" ref={host} />
          </div>
          <div className="notes-toolbar">
            {drawing === undefined ? (
              <>
                <button type="button" onClick={() => add(inView())}>Add a note for the part in view</button>
                <button type="button" onClick={() => draw('new')}>Draw a new note’s part</button>
                {open && (
                  // Under the picture on a narrow screen, where the open note's own buttons are further down the page.
                  <span className="notes-toolbar-note" role="group" aria-label={`Note ${index + 1}`}>
                    <span>Note {index + 1}:</span>
                    <button type="button" onClick={() => change(open.key, { region: inView() ?? open.region })}>Use the part in view</button>
                    <button type="button" onClick={() => draw(open.key)}>{open.region ? 'Draw it again' : 'Draw it'}</button>
                  </span>
                )}
                <p id="picture-hint" className="hint">
                  Zoom in on a part of the picture, then add a note for it. Choose a number on the picture to open its note.
                </p>
              </>
            ) : (
              <>
                <button type="button" onClick={stopDrawing}>Stop drawing</button>
                <p id="picture-hint" className="hint" role="status">
                  Drag across the picture, round the part for {drawing === 'new' ? 'a new note' : `note ${numberOf(drawing)}`}. It still zooms; Escape stops.
                </p>
              </>
            )}
          </div>
        </section>

        <div className="notes-panel">
          <Status
            count={items.length}
            changed={changed.length > 0}
            restored={restored}
            kept={kept && storage !== undefined}
            previewable={items.some(({ region }) => region)}
            onStartAgain={startAgain}
            onPreview={save}
          />

          <section className="notes-section" aria-labelledby="intro-heading">
            <Disclosure
              id="intro"
              open={selected === 'intro'}
              onToggle={() => choose(selected === 'intro' ? undefined : 'intro')}
              label={<span className="note-row-title" id="intro-heading">Introduction</span>}
              detail={notes.intro[own.language]?.trim() ? excerpt(notes.intro[own.language]) : 'Optional: what comes before the notes.'}
              problems={problemsFor('intro')}
            >
              {files.map(({ file, language }, i) => (
                <label className="field" key={file}>
                  <span className="field-label">{i === 0 ? 'Introduction' : `Introduction in ${languageName(language)}`}</span>
                  <textarea
                    value={notes.intro[language] ?? ''}
                    lang={lang(language)}
                    rows={3}
                    onChange={(event) => setNotes((now) => ({ ...now, intro: { ...now.intro, [language]: event.target.value } }))}
                  />
                </label>
              ))}
              <span className="hint">Markdown, as in description.md. The page shows it above the notes.</span>
            </Disclosure>
          </section>

          <section className="notes-section" aria-labelledby="notes-heading">
            <h2 id="notes-heading">Notes, in the order of the tour</h2>
            {items.length === 0 && (
              <div className="notes-empty">
                <p>
                  Notes point out parts of your picture. Each is a numbered marker on it, and a note in the list beneath it; in order, they make a
                  tour that visitors can step through. <a href={DEMO}>See the notes demo</a>.
                </p>
                <p>To add one, zoom in on a part of the picture and choose <b>Add a note for the part in view</b>, or <b>Draw a new note’s part</b>.</p>
              </div>
            )}
            <ol className="notes-list">
              {items.map((note, i) => (
                <Disclosure
                  key={note.key}
                  id={`note-${note.key}`}
                  item
                  open={selected === note.key}
                  onToggle={() => {
                    choose(selected === note.key ? undefined : note.key, { show: selected !== note.key });
                    setReveal(`note-${note.key}`); // in view, as the note open above it closes
                  }}
                  label={
                    <>
                      <span className="note-number" aria-hidden="true">{i + 1}</span>
                      <span className="note-row-title" lang={lang(own.language)}>
                        <span className="visually-hidden">Note {i + 1}: </span>
                        {note.title[own.language]?.trim() || <i>Untitled</i>}
                      </span>
                    </>
                  }
                  order={
                    <span className="note-order">
                      <button type="button" aria-label={`Move note ${i + 1} up`} title="Move up" onClick={() => move(note.key, -1)} disabled={i === 0}>↑</button>
                      <button type="button" aria-label={`Move note ${i + 1} down`} title="Move down" onClick={() => move(note.key, 1)} disabled={i === items.length - 1}>↓</button>
                    </span>
                  }
                  problems={problemsFor(note.key)}
                >
                  <label className="field">
                    <span className="field-label">Title</span>
                    <input id={`note-title-${note.key}`} value={note.title[own.language] ?? ''} lang={lang(own.language)} onChange={(event) => words(note.key, 'title', own.language, event.target.value)} />
                  </label>
                  <div className="field">
                    <label className="field-label" htmlFor={`note-text-${note.key}`}>Text</label>
                    <textarea
                      id={`note-text-${note.key}`}
                      value={note.text[own.language] ?? ''}
                      lang={lang(own.language)}
                      rows={4}
                      aria-describedby="markdown-hint"
                      onChange={(event) => words(note.key, 'text', own.language, event.target.value)}
                    />
                    <span className="hint" id="markdown-hint">Markdown: *italic*, **bold**, [a link](https://…), ### a heading.</span>
                  </div>
                  {translations.map(({ file, language }) => (
                    <fieldset key={file} className="note-translation">
                      <legend>In {languageName(language)}, for {file}</legend>
                      <label className="field">
                        <span className="field-label">Title in {languageName(language)}</span>
                        <input value={note.title[language] ?? ''} lang={lang(language)} onChange={(event) => words(note.key, 'title', language, event.target.value)} />
                      </label>
                      <label className="field">
                        <span className="field-label">Text in {languageName(language)}</span>
                        <textarea value={note.text[language] ?? ''} lang={lang(language)} rows={3} onChange={(event) => words(note.key, 'text', language, event.target.value)} />
                      </label>
                    </fieldset>
                  ))}
                  <div className="field">
                    <span className="field-label">Part of the picture</span>
                    <span className="hint">
                      {note.region ? describe(note.region, site) : 'None yet.'}
                    </span>
                    <span className="note-buttons">
                      {note.region && (
                        <button type="button" aria-label={`Show note ${i + 1}`} onClick={() => choose(note.key, { show: true, scroll: true })}>Show it</button>
                      )}
                      <button type="button" aria-label={`Use the part in view for note ${i + 1}`} onClick={() => change(note.key, { region: inView() ?? note.region })}>
                        Use the part in view
                      </button>
                      <button type="button" aria-label={`Draw it: note ${i + 1}`} onClick={() => draw(note.key)} disabled={drawing !== undefined}>
                        {note.region ? 'Draw it again' : 'Draw it'}
                      </button>
                    </span>
                  </div>
                  <button type="button" className="quiet" aria-label={`Remove note ${i + 1}`} onClick={() => remove(note.key)}>Remove this note</button>
                </Disclosure>
              ))}
            </ol>
            {removed && (
              <p className="notes-removed" role="status">
                Removed “{removed.note.title[own.language]?.trim() || 'Untitled'}”. <button type="button" className="quiet" onClick={undoRemove}>Undo</button>
              </p>
            )}
          </section>

          <Publish
            written={written}
            changed={changed}
            problems={problems}
            existing={own.text.trim() !== ''}
            links={links}
            copied={copied}
            watch={watch}
            onCopy={copy}
            onDownload={download}
            onGoTo={(key) => {
              choose(key);
              setReveal(key === 'intro' ? 'intro' : `note-${key}`);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** The first words of some Markdown, for a closed note's line in the list. */
const excerpt = (markdown: string) => {
  const flat = markdown.replace(/[#*_`>[\]]/g, '').replace(/\(https?:[^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
};

/** A line in the list that opens to show what it holds: the introduction, or a note. */
function Disclosure({
  id,
  item,
  open,
  onToggle,
  label,
  detail,
  order,
  problems,
  children,
}: {
  id: string;
  item?: boolean;
  open: boolean;
  onToggle: () => void;
  label: ReactNode;
  detail?: string;
  order?: ReactNode;
  problems: Problem[];
  children: ReactNode;
}) {
  const Tag = item ? 'li' : 'div';
  return (
    <Tag className="note" id={id} data-open={open ? '' : undefined}>
      <div className="note-row">
        <button type="button" className="note-row-button" aria-expanded={open} aria-controls={`${id}-editor`} onClick={onToggle}>
          {label}
          {detail && !open && <span className="note-row-detail">{detail}</span>}
        </button>
        {order}
      </div>
      {problems.length > 0 && (
        <ul className="note-problems">
          {problems.map(({ message }) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {open && (
        <div className="note-editor" id={`${id}-editor`}>
          {children}
        </div>
      )}
    </Tag>
  );
}

/** Where the notes stand: changed or not, kept in the browser or not, and the preview of them on the site's page. */
function Status({
  count,
  changed,
  restored,
  kept,
  previewable,
  onStartAgain,
  onPreview,
}: {
  count: number;
  changed: boolean;
  restored?: { saved: number; stale: boolean };
  kept: boolean;
  /** Whether there is anything to show on the site's page: a note with a part of the picture. */
  previewable: boolean;
  onStartAgain: () => void;
  onPreview: () => void;
}) {
  const notes = count === 1 ? 'One note' : `${count} notes`;
  return (
    <div className="notes-status">
      {restored && (
        <p>
          These are the changes you made in this browser on {when(restored.saved)}, not yet on your site.{' '}
          {restored.stale && <b>Your site’s notes have changed since then, perhaps on GitHub: putting these on your site would undo that. </b>}
          <button type="button" className="quiet" onClick={onStartAgain}>Start again from your site’s notes</button>
        </p>
      )}
      <p aria-live="polite">
        {count === 0 && !changed
          ? 'No notes yet.'
          : `${notes}${changed ? `. Changed, and not yet on your site${kept ? ': this browser keeps the changes until then' : ''}.` : ', as on your site.'}`}
      </p>
      {!kept && changed && <p className="problem">This browser will not keep your changes: put them on your site before you leave this page.</p>}
      {kept && previewable && (
        <p>
          <a className="button" href="./?notes-draft" target="whatiiif-preview" onClick={onPreview}>
            Preview them on your site
          </a>{' '}
          <span className="hint">Its page, with these notes and their tour, as visitors will see them.</span>
        </p>
      )}
    </div>
  );
}

/** How to put the notes on the site: what stops them, else the steps on GitHub; then the site watched for them. */
function Publish({
  written,
  changed,
  problems,
  existing,
  links,
  copied,
  watch,
  onCopy,
  onDownload,
  onGoTo,
}: {
  written: Written[];
  changed: Written[];
  problems: Problem[];
  existing: boolean;
  links: Links;
  copied?: boolean;
  watch?: { late?: boolean; arrived?: boolean };
  onCopy: (file: Written) => void;
  onDownload: () => void;
  onGoTo: (key: number | 'intro') => void;
}) {
  const names = (files: Written[]) => files.map(({ file }) => file).join(' and ');
  const rebuilt = (
    <li>
      Click <b>Commit changes</b>. Your site is rebuilt in a minute or two, and this page says when it has your notes.
    </li>
  );
  let steps: ReactNode;
  if (problems.length > 0) {
    steps = (
      <div className="problem">
        <p>Your site could not be built with these notes yet:</p>
        <ul>
          {problems.map(({ key, message }) => (
            <li key={`${key}${message}`}>
              {key === undefined ? message : <button type="button" className="link" onClick={() => onGoTo(key)}>{message}</button>}
            </li>
          ))}
        </ul>
      </div>
    );
  } else if (changed.length === 0) {
    steps = watch?.arrived ? (
      <p role="status">
        Your site has these notes now. <a href="./">See them</a>.
      </p>
    ) : (
      <p className="hint">These are the notes your site has. Once you change them, this says how to put them on it.</p>
    );
  } else if (changed.length === 1) {
    const [file] = changed;
    const make = !existing && file === written[0];
    steps = (
      <ol className="steps">
        <li>
          <button type="button" onClick={() => onCopy(file)} aria-live="polite">{copied ? 'Copied' : `Copy ${file.file}`}</button>
          {copied === false && <span className="hint"> Your browser would not copy it: open <b>See {file.file}</b>, below, and copy everything in it.</span>}
        </li>
        <li>
          {make ? (
            <>
              {links.notesUrl ? <a href={links.notesUrl}>Make content/notes.md on GitHub</a> : <>Make <code>content/notes.md</code> on GitHub</>}, and paste it in.
            </>
          ) : (
            <>
              {(file === written[0] ? links.notesUrl : file.url) ? (
                <a href={file === written[0] ? links.notesUrl : file.url}>Open {file.file} on GitHub</a>
              ) : (
                <>Open <code>content/{file.file}</code> on GitHub</>
              )}
              , select everything in it, and paste over it.
            </>
          )}
        </li>
        {rebuilt}
      </ol>
    );
  } else {
    steps = (
      <ol className="steps">
        <li>
          <button type="button" onClick={onDownload}>Download {names(changed)}</button>
        </li>
        <li>
          {links.uploadUrl ? <a href={links.uploadUrl}>Upload them to your content folder on GitHub</a> : <>Upload them to <code>content</code> on GitHub</>}: drop
          the files there, and they take the place of those it has.
        </li>
        {rebuilt}
      </ol>
    );
  }
  return (
    <section className="notes-section notes-publish" aria-labelledby="publish-heading">
      <h2 id="publish-heading">Put them on your site</h2>
      {steps}
      {watch && !watch.arrived && changed.length > 0 && (
        <p className="hint" role="status">
          {watch.late ? (
            <>
              Your site does not have them yet. If its build stopped, {links.actionsUrl ? <a href={links.actionsUrl}>the Actions tab</a> : 'the Actions tab'} says
              why.
            </>
          ) : (
            'Watching for your site to have them…'
          )}
        </p>
      )}
      <details className="notes-files">
        <summary>See {names(written)}</summary>
        {written.map((file) => (
          <textarea key={file.file} readOnly value={file.text} aria-label={file.file} rows={12} wrap="off" onFocus={(event) => event.currentTarget.select()} />
        ))}
      </details>
    </section>
  );
}
