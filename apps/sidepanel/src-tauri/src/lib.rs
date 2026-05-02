#[cfg(not(target_os = "macos"))]
compile_error!("Band Side Panel only supports macOS");

mod commands;
mod git;
mod state;
mod store;
mod worktrees;

use std::fs::OpenOptions;
use std::io::Write;

use state::{ActiveWorkspaceState, FocusManagementState, ProjectCache};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

const MAX_LOG_SIZE: u64 = 5 * 1024 * 1024; // 5 MB

pub(crate) fn log_to_file(msg: &str) {
    let dir = state::band_home();
    let _ = std::fs::create_dir_all(&dir);
    let log_path = dir.join("sidepanel.log");
    if let Ok(meta) = std::fs::metadata(&log_path) {
        if meta.len() > MAX_LOG_SIZE {
            let _ = std::fs::rename(&log_path, log_path.with_extension("log.old"));
        }
    }
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&log_path) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(f, "[{now}] {msg}");
    }
}

#[macro_export]
macro_rules! sp_log {
    ($($arg:tt)*) => {{
        let msg = format!($($arg)*);
        eprintln!("{}", msg);
        $crate::log_to_file(&msg);
    }};
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Panic hook → write to sidepanel.log so we capture crashes when the user
    // launches us by double-clicking (no terminal attached).
    std::panic::set_hook(Box::new(|info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        let msg = format!("PANIC: {info}\n{backtrace}");
        eprintln!("{msg}");
        log_to_file(&msg);
    }));

    log_to_file("sidepanel starting");

    // Persisted focus-polling preference; defaults to enabled.
    let initial_focus_polling = store::load().window.focus_polling;

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init());

    let app = builder
        .manage(ActiveWorkspaceState::new())
        .manage(ProjectCache::new())
        .manage(FocusManagementState::new(initial_focus_polling))
        .invoke_handler(tauri::generate_handler![
            commands::projects::list_projects,
            commands::projects::add_project,
            commands::projects::remove_project,
            commands::worktrees::list_worktrees,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::window_focus::workspace_focus,
            commands::window_focus::workspace_close,
            commands::window_focus::get_active_workspace,
            commands::window_focus::detect_active_workspace,
            commands::window_dialogs::pick_folder,
            commands::window_dialogs::reveal_in_finder,
            commands::window_dialogs::check_app_exists,
            commands::window_dialogs::open_with_app,
        ])
        .setup(move |app| {
            let window = app.get_webview_window("main").unwrap();

            // Standard macOS menus so Cmd+C/V/X/A and Cmd+R route correctly.
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;

            let reload_item = MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?;
            let view_menu = SubmenuBuilder::new(app, "View")
                .item(&reload_item)
                .build()?;

            let app_menu = SubmenuBuilder::new(app, "Band Side Panel")
                .item(&PredefinedMenuItem::about(app, None, None)?)
                .separator()
                .item(&PredefinedMenuItem::hide(app, None)?)
                .item(&PredefinedMenuItem::hide_others(app, None)?)
                .item(&PredefinedMenuItem::show_all(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, None)?)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&view_menu)
                .build()?;
            app.set_menu(menu)?;

            let app_handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                if event.id() == "reload" {
                    let target = app_handle
                        .webview_windows()
                        .values()
                        .find(|w| w.is_focused().unwrap_or(false))
                        .cloned()
                        .or_else(|| app_handle.get_webview_window("main"));
                    if let Some(win) = target {
                        if let Ok(url) = win.url() {
                            let _ = win.navigate(url);
                        }
                    }
                }
            });

            // Black background so the area behind macOS traffic lights matches the dark panel UI.
            #[allow(deprecated)]
            {
                use cocoa::appkit::NSColor;
                use cocoa::appkit::NSWindow;
                use cocoa::base::{id, nil};
                let ns_window = window.ns_window().unwrap() as id;
                unsafe {
                    let color =
                        NSColor::colorWithSRGBRed_green_blue_alpha_(nil, 0.0, 0.0, 0.0, 1.0);
                    ns_window.setBackgroundColor_(color);
                }
            }

            // Default size: settings.window.width × full screen height. Edge
            // pinning lands in PR 3 — for now we just stretch to screen height.
            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen_size = monitor.size();
                let scale_factor = monitor.scale_factor();
                let screen_height = f64::from(screen_size.height) / scale_factor;
                let saved_width = store::load().window.width.max(240.0);

                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                    0.0, 0.0,
                )));
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(
                    saved_width,
                    screen_height,
                )));
            }

            // Start focus polling if enabled. The thread exits when the flag flips.
            {
                let focus_state = app.state::<FocusManagementState>();
                if focus_state.0.load(std::sync::atomic::Ordering::SeqCst) {
                    let focus_flag = focus_state.inner().0.clone();
                    commands::window_focus::start_focus_polling(app.handle().clone(), focus_flag);
                }
            }

            // Raise this workspace's app windows whenever the panel itself gains focus.
            {
                let focus_flag = app.state::<FocusManagementState>().inner().0.clone();
                let active_ws_state = app.state::<ActiveWorkspaceState>().inner().0.clone();
                let raise_cache = app.state::<ProjectCache>().inner().clone();
                let window_ref = app.get_webview_window("main").unwrap();
                window_ref.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(true) = event {
                        if !focus_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            return;
                        }
                        let workspace_id =
                            active_ws_state.lock().ok().and_then(|guard| guard.clone());
                        if let Some(ws_id) = workspace_id {
                            commands::window_focus::raise_workspace_windows(&ws_id, &raise_cache);
                        }
                    }
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_, _| {});
}
