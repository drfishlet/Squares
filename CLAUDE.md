# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Squares** is a Tauri v2 sticky-notes desktop app. It lives in the system tray; clicking the tray icon toggles the main (launcher) window, and each note is an independent `WebviewWindow` loading `note.html`. The stack is Tauri v2 + vanilla TypeScript + Vite — no frontend framework.

## Commands

```bash
# Full dev mode (starts Vite + Rust backend + opens the app)
npm run tauri dev

# Frontend only (Vite dev server at localhost:1420 — no Rust, no window)
npm run dev

# Production build (TypeScript + Vite + Tauri bundle)
npm run tauri build

# TypeScript + Vite build only (outputs to dist/)
npm run build
```

## Architecture

### Two distinct HTML contexts

| File | Role |
|------|------|
| `index.html` / `src/main.ts` | Main launcher window. Hidden by default (`visible: false` in `tauri.conf.json`). Toggled via tray left-click or "Show Window" menu item. |
| `note.html` | Each sticky note. Loaded into its own `WebviewWindow` with a random `sticky-{uuid}` label. Self-contained: all JS is inline `<script>` at the bottom of the file. |

### Frontend (`src/`)

- **`StickyWin.ts`** — factory that opens a new `WebviewWindow` pointed at `/note.html`. Note windows use `decorations: false` (no native title bar) because `minimizable: false` is a no-op on Linux/GTK; the in-page `.title` div with `data-tauri-drag-region` serves as the drag handle. The title `<input>` needs a manual `mousedown` → `startDragging()` workaround because `data-tauri-drag-region` doesn't propagate through `<input>` elements.
- **`main.ts`** — wires up the launcher form and listens for the `"create-note"` Tauri event emitted by the tray menu's "New Note" item.

### Backend (`src-tauri/src/lib.rs`)

- Builds the system tray with a menu: **New Note**, **Show Window**, separator, **Quit**.
- Left-click on the tray icon toggles the `"main"` webview window show/hide.
- `on_window_event` intercepts `CloseRequested` on `"main"` and hides instead of closing (minimize-to-tray behaviour).
- Emits the `"create-note"` event to the frontend when the tray menu item is clicked.
- The `greet` command is boilerplate from the Tauri template and is still wired up in the launcher UI.

### `withGlobalTauri: true`

Set in `tauri.conf.json`. This injects `window.__TAURI__` globally, which is why `note.html` can call `window.__TAURI__.window.getCurrentWindow()` without ES module imports (it has no bundler). Do not remove this setting.

### Capabilities

`src-tauri/capabilities/default.json` controls which Tauri APIs are exposed to the frontend. If you add a new Tauri plugin or API call, you may need to add a permission there.
