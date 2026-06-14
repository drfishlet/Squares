use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// On-disk shape of a note. Mirrors the `Note` interface in src/repo.ts; the
/// camelCase rename maps `last_modified`/`is_closed` to `lastModified`/`isClosed`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Note {
    uuid: String,
    title: String,
    content: String,
    color: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    last_modified: String,
    is_closed: bool,
}

/// Directory where notes live: `~/.squares` on Linux/macOS, `%APPDATA%\Squares`
/// on Windows. Created if missing.
fn notes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = if cfg!(windows) {
        app.path().data_dir().map_err(|e| e.to_string())?.join("Squares")
    } else {
        app.path().home_dir().map_err(|e| e.to_string())?.join(".squares")
    };
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    Ok(base)
}

/// Append a timestamped line to `squares.log` in the notes directory. Best-effort:
/// a logging failure must never disrupt the operation that triggered it.
fn append_log(app: &AppHandle, message: &str) {
    if let Err(e) = try_append_log(app, message) {
        eprintln!("could not write squares.log: {}", e);
    }
}

fn try_append_log(app: &AppHandle, message: &str) -> Result<(), String> {
    let path = notes_dir(app)?.join("squares.log");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{} {}", Utc::now().to_rfc3339(), message).map_err(|e| e.to_string())?;
    Ok(())
}

/// Log a caught error from the frontend to `squares.log`. Timestamps are generated
/// here so every line in the file shares one format, wherever the error originated.
#[tauri::command]
fn log_message(app: AppHandle, message: String) {
    append_log(&app, &message);
}

/// Persist a single note as `{uuid}.note`. Writes to a temp file and renames so a
/// reader never sees a half-written file.
#[tauri::command]
fn save_note(app: AppHandle, note: Note) -> Result<(), String> {
    let dir = notes_dir(&app)?;
    let json = serde_json::to_string_pretty(&note).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{}.note.tmp", note.uuid));
    let path = dir.join(format!("{}.note", note.uuid));
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Permanently delete a note's file (used for hard-delete, not for closing).
#[tauri::command]
fn delete_note(app: AppHandle, uuid: String) -> Result<(), String> {
    let path = notes_dir(&app)?.join(format!("{}.note", uuid));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Load every `*.note` file. A malformed file is logged and skipped rather than
/// failing the whole load.
#[tauri::command]
fn load_notes(app: AppHandle) -> Result<Vec<Note>, String> {
    let dir = notes_dir(&app)?;
    let mut notes = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("note") {
            continue;
        }
        match fs::read_to_string(&path) {
            Ok(s) => match serde_json::from_str::<Note>(&s) {
                Ok(note) => notes.push(note),
                Err(e) => append_log(&app, &format!("[load_notes] skipping malformed note {:?}: {}", path, e)),
            },
            Err(e) => append_log(&app, &format!("[load_notes] could not read note {:?}: {}", path, e)),
        }
    }
    Ok(notes)
}

/// Read a single note by uuid, or `None` if no file exists yet. Used by note.html
/// to hydrate its own UI on load.
#[tauri::command]
fn get_note(app: AppHandle, uuid: String) -> Result<Option<Note>, String> {
    let path = notes_dir(&app)?.join(format!("{}.note", uuid));
    if !path.exists() {
        return Ok(None);
    }
    let s = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let note = serde_json::from_str::<Note>(&s).map_err(|e| e.to_string())?;
    Ok(Some(note))
}

// Native window resize, started from the JS resize handles in note.html. `direction`
// is deserialized straight from the matching ResizeDirection variant name (e.g. "SouthEast").
// This hands off to the WM (GTK begin_resize_drag on Linux), so the grab is as reliable as
// the native border but triggered from our wide CSS hit-zones.
#[tauri::command]
fn start_resize(
    window: tauri::Window,
    direction: tauri_runtime::ResizeDirection,
) -> Result<(), String> {
    window.start_resize_dragging(direction).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let new_note =
                MenuItem::with_id(app, "new_note", "New Note", true, None::<&str>)?;
            let show_window =
                MenuItem::with_id(app, "show_window", "Show Window", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&new_note, &show_window, &separator, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Squares")
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "new_note" => {
                        let _ = app.emit("create-note", ());
                    }
                    "show_window" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // On desktops that distinguish left vs right clicks,
                    // left-click toggles the main window.
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // Hide the main window to tray instead of quitting when the user closes it.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_resize,
            save_note,
            delete_note,
            load_notes,
            get_note,
            log_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
