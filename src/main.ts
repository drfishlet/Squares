import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import createStickyWin, { reopenNote } from "./StickyWin.ts";
import { initRepo, hydrate, logError, type Note } from "./repo.ts";

let greetInputEl: HTMLInputElement | null;
let greetMsgEl: HTMLElement | null;

async function greet() {
  if (greetMsgEl && greetInputEl) {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    greetMsgEl.textContent = await invoke("greet", {
      name: greetInputEl.value,
    });


    createStickyWin(greetInputEl.value);
  }
}

// Load saved notes from disk into the store, then reopen a window for each note
// that wasn't closed. Runs after initRepo() so the change listeners are already
// registered when the reopened windows start reporting.
async function restoreNotes() {
  let notes: Note[];
  try {
    notes = await invoke<Note[]>("load_notes");
  } catch (e) {
    logError("load_notes", e);
    return;
  }
  hydrate(notes);
  // Reopen each note in isolation so one bad note can't abort the rest.
  for (const note of notes) {
    if (note.isClosed) continue;
    try {
      reopenNote(note);
    } catch (e) {
      logError(`reopen ${note.uuid}`, e);
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  // Start the central note store (listens for change events from note windows).
  initRepo();
  restoreNotes();

  greetInputEl = document.querySelector("#greet-input");
  greetMsgEl = document.querySelector("#greet-msg");
  document.querySelector("#greet-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    greet();
  });

  // Create a new note when triggered from the system tray menu.
  listen("create-note", () => {
    createStickyWin("New Note");
  });
});
