use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        .invoke_handler(tauri::generate_handler![greet, start_resize])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
