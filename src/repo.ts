import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

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
  const result = existing ? Object.assign(existing, note) : (Notes.push(note), note);
  persist(note.uuid);
  return result;
}

/** Apply a partial change to a note. uuid is never overwritten, and any change
 *  refreshes lastModified — so every change path is stamped in one place. */
export function updateNote(uuid: string, patch: Partial<Note>): Note | undefined {
  const note = getNote(uuid);
  if (!note) return undefined;
  Object.assign(note, patch, { uuid, lastModified: new Date().toISOString() });
  persist(uuid);
  return note;
}

export function removeNote(uuid: string): void {
  const i = Notes.findIndex((n) => n.uuid === uuid);
  if (i !== -1) Notes.splice(i, 1);
  // Permanent delete: cancel any pending save and remove the file from disk.
  const timer = saveTimers.get(uuid);
  if (timer !== undefined) {
    clearTimeout(timer);
    saveTimers.delete(uuid);
  }
  invoke("delete_note", { uuid }).catch((e) => console.error("delete_note failed:", e));
}

// --- Persistence -----------------------------------------------------------
//
// Each change schedules a debounced write of the whole note to disk (one
// {uuid}.note file per note, written by the Rust `save_note` command). Debouncing
// absorbs rapid bursts — content keystrokes and move/resize drags.

const SAVE_DEBOUNCE_MS = 400;
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function persist(uuid: string): void {
  const existing = saveTimers.get(uuid);
  if (existing !== undefined) clearTimeout(existing);
  saveTimers.set(
    uuid,
    setTimeout(() => {
      saveTimers.delete(uuid);
      const note = getNote(uuid);
      if (note) invoke("save_note", { note }).catch((e) => console.error("save_note failed:", e));
    }, SAVE_DEBOUNCE_MS),
  );
}

/**
 * Populate the store from notes loaded off disk at startup. Deliberately bypasses
 * updateNote/persist so loading never re-stamps lastModified or rewrites the files
 * it just read.
 */
export function hydrate(notes: Note[]): void {
  for (const note of notes) {
    const existing = getNote(note.uuid);
    if (existing) Object.assign(existing, note);
    else Notes.push(note);
  }
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
