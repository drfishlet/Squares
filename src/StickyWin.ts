import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { addNote, DEFAULT_COLOR, logError, type Note } from "./repo";

/**
 * Opens a sticky-note window. `label` must be alphanumeric plus - / : _ (no spaces).
 *
 * **Linux:** There is no API to hide *only* the minimize button. Tao’s GTK header bar always uses a
 * layout that includes minimize (`menu:minimize,…`). `minimizable: false` is a no-op on Linux.
 *
 * **`decorations: false`** removes the whole native title bar (minimize/maximize/close all go away).
 * To move the window you typically rely on your WM (e.g. Super+drag on many desktops), or load an
 * in-app page that includes a `data-tauri-drag-region` strip. External URLs cannot add that
 * without a local wrapper page.
 *
 * The window label embeds the uuid; the note window reads it back to identify itself when
 * reporting changes to the repo, and to hydrate its UI from disk (see note.html).
 */
function openWindow(
  uuid: string,
  title: string,
  geometry: { x?: number; y?: number; width: number; height: number },
) {
  const win = new WebviewWindow(`sticky-${uuid}`, {
    title,
    url: "/note.html",
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    minimizable: false,
    maximizable: false,
    resizable: true,
    // Linux: only practical way to drop the minimize button with stock Tauri/GTK (see docstring).
    decorations: false,
  });

  win.once("tauri://created", async () => {
    try {
      await win.setMinimizable(false);
      await win.setMaximizable(false);
    } catch (e) {
      logError(`window ${uuid} minimizable/maximizable`, e);
    }
  });

  win.once("tauri://error", (e) => {
    logError(`window ${uuid}`, e?.payload ?? e);
  });

  return win;
}

/** Create a brand-new note: seed the store (which persists it) and open its window.
 *  No position is given, so the window manager places it. */
export default function createStickyWin(title: string) {
  const uuid = crypto.randomUUID();
  const width = 250;
  const height = 250;

  // Seed the central store. The note window corrects x/y with its real (WM-chosen)
  // geometry once it loads, and reports title/content/color as they're edited.
  addNote({
    uuid,
    title,
    content: "",
    color: DEFAULT_COLOR,
    x: 0,
    y: 0,
    width,
    height,
    lastModified: new Date().toISOString(),
    isClosed: false,
  });

  return openWindow(uuid, title, { width, height });
}

/** Reopen a note loaded from disk: it's already in the store (hydrated), so just
 *  open its window at the saved geometry. The note window populates its own UI.
 *
 *  Idempotent: if the window is already open (e.g. the main window's page reloaded
 *  and re-ran restore), this is a no-op rather than a "label already exists" error. */
export async function reopenNote(note: Note) {
  const existing = await WebviewWindow.getByLabel(`sticky-${note.uuid}`);
  if (existing) return existing;
  return openWindow(note.uuid, note.title, {
    x: note.x,
    y: note.y,
    width: note.width,
    height: note.height,
  });
}
