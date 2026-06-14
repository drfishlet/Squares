import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import createStickyWin from "./StickyWin.ts";
import { initRepo } from "./repo.ts";

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

window.addEventListener("DOMContentLoaded", () => {
  // Start the central note store (listens for change events from note windows).
  initRepo();

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
