import { listen } from "@tauri-apps/api/event";

export interface Note {
  uuid: string;
  title: string;
  content: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** ISO 8601 timestamp, refreshed on every change via updateNote. */
  lastModified: string;
  /** True once the note's window has been closed; the data is kept, not deleted. */
  isClosed: boolean;
}

/** The central store. Lives in the main window only (see note below). */
export const Notes: Note[] = [];

export const DEFAULT_COLOR = "#FFFDE7";

export function getNote(uuid: string): Note | undefined {
  return Notes.find((n) => n.uuid === uuid);
}

/** Insert a note, or merge into the existing one if its uuid is already present. */
export function addNote(note: Note): Note {
  const existing = getNote(note.uuid);
  if (existing) return Object.assign(existing, note);
  Notes.push(note);
  return note;
}

/** Apply a partial change to a note. uuid is never overwritten, and any change
 *  refreshes lastModified — so every change path is stamped in one place. */
export function updateNote(uuid: string, patch: Partial<Note>): Note | undefined {
  const note = getNote(uuid);
  if (!note) return undefined;
  Object.assign(note, patch, { uuid, lastModified: new Date().toISOString() });
  return note;
}

export function removeNote(uuid: string): void {
  const i = Notes.findIndex((n) => n.uuid === uuid);
  if (i !== -1) Notes.splice(i, 1);
}

function defaults(uuid: string): Note {
  return {
    uuid,
    title: "",
    content: "",
    color: DEFAULT_COLOR,
    x: 0,
    y: 0,
    width: 250,
    height: 250,
    lastModified: new Date().toISOString(),
    isClosed: false,
  };
}

/**
 * Each note lives in its own WebviewWindow (a separate JS realm), so this module
 * cannot be a shared import across them. Instead this single store instance — held
 * by the main window, whose webview is alive from startup even while hidden — listens
 * for change events broadcast by the note windows (see note.html) and applies them.
 *
 * Call once, from the main window, at startup.
 */
export function initRepo(): void {
  listen<Partial<Note> & { uuid: string }>("note:update", (e) => {
    const { uuid } = e.payload;
    if (!uuid) return;
    // A note window may report changes before / without a prior seed (addNote);
    // fall back to defaults so the update is never dropped.
    if (getNote(uuid)) updateNote(uuid, e.payload);
    else addNote({ ...defaults(uuid), ...e.payload });
  });

  listen<{ uuid: string }>("note:remove", (e) => removeNote(e.payload.uuid));
}
