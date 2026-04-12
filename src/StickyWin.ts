import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

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
  const label = `sticky-${crypto.randomUUID()}`;
  const win = new WebviewWindow(label, {
    title,
    url: "/note.html",
    width: 250,
    height: 250,
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
