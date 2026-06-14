import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import createStickyWin, { reopenNote } from "./StickyWin.ts";
import { initRepo, hydrate, type Note } from "./repo.ts";

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
  try {
    const notes = await invoke<Note[]>("load_notes");
    hydrate(notes);
    for (const note of notes) {
      if (!note.isClosed) reopenNote(note);
    }
  } catch (e) {
    console.error("load_notes failed:", e);
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
