import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { addNote, DEFAULT_COLOR } from "./repo";

/**
 * Opens a new window. `label` must be alphanumeric plus - / : _ (no spaces).
 *
 * **Linux:** There is no API to hide *only* the minimize button. Tao’s GTK header bar always uses a
 * layout that includes minimize (`menu:minimize,…`). `minimizable: false` is a no-op on Linux.
 *
 * **`decorations: false`** removes the whole native title bar (minimize/maximize/close all go away).
 * To move the window you typically rely on your WM (e.g. Super+drag on many desktops), or load an
 * in-app page that includes a `data-tauri-drag-region` strip. External URLs cannot add that
 * without a local wrapper page.
 */
export default function createStickyWin(title: string) {
  const uuid = crypto.randomUUID();
  // The window label embeds the uuid; the note window reads it back to identify
  // itself when reporting changes to the repo (see note.html).
  const label = `sticky-${uuid}`;
  const width = 250;
  const height = 250;

  // Seed the central store. The note window corrects x/y/width/height with its
  // real geometry once it loads, and reports title/content/color as they're edited.
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

  const win = new WebviewWindow(label, {
    title,
    url: "/note.html",
    width,
    height,
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
      console.warn("Could not set minimizable/maximizable:", e);
    }
  });

  win.once("tauri://error", (e) => {
    console.error("WebviewWindow failed:", e);
  });

  return win;
}
