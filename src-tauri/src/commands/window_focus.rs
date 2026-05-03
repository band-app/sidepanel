//! Window focus management — workspace detection, focus polling, and the
//! `workspace_focus` command that opens/raises an IDE workspace's windows.
//!
//! Lifted from `apps/dashboard/src-tauri/src/commands/ide.rs` in the original
//! band-app/band repo. Two changes:
//!  1. `refresh_project_cache` no longer hits the band web server. Projects
//!     come from `~/.band-sidepanel/settings.json` and worktrees are resolved
//!     live via `git worktree list --porcelain`.
//!  2. `clear_needs_attention` (which called the band tRPC API) is gone — the
//!     side panel does not own agent state.

use std::collections::{HashMap, VecDeque};
use std::ffi::c_void;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Duration;

use tauri::{Emitter, Manager};

use crate::state;
use crate::state::{ActiveWorkspaceState, FocusManagementState, ProjectCache};
use crate::store;
use crate::worktrees;

use super::apps::{self, AppHandler};
use super::ax_windows::{
    self, get_bundle_id, get_frontmost_window, objc_getClass, objc_msgSend, proc_listpids,
    proc_pidinfo, sel_registerName, PROC_ALL_PIDS, PROC_PIDTBSDINFO, PROC_PIDVNODEPATHINFO,
};
use super::window_manager::WindowManager;

fn log_debug(msg: &str) {
    let log_file = state::band_home().join("debug.log");
    if let Some(parent) = log_file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_file)
    {
        let elapsed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        let secs = elapsed.as_secs();
        let millis = elapsed.subsec_millis();
        let _ = writeln!(f, "[{secs}.{millis:03}] {msg}");
    }
}

// --- libproc: process enumeration and CWD lookup ---

fn get_all_pids() -> Vec<i32> {
    unsafe {
        let buf_size = proc_listpids(PROC_ALL_PIDS, 0, std::ptr::null_mut(), 0);
        if buf_size <= 0 {
            return Vec::new();
        }

        let count = buf_size as usize / std::mem::size_of::<i32>();
        let mut pids = vec![0i32; count];
        let actual = proc_listpids(
            PROC_ALL_PIDS,
            0,
            pids.as_mut_ptr().cast::<c_void>(),
            buf_size,
        );

        if actual <= 0 {
            return Vec::new();
        }

        let actual_count = actual as usize / std::mem::size_of::<i32>();
        pids.truncate(actual_count);
        pids.retain(|&p| p > 0);
        pids
    }
}

#[allow(clippy::similar_names)]
fn get_ppid(pid: i32) -> Option<i32> {
    unsafe {
        let mut buf = [0u8; 256];
        let ret = proc_pidinfo(
            pid,
            PROC_PIDTBSDINFO,
            0,
            buf.as_mut_ptr().cast::<c_void>(),
            buf.len() as i32,
        );
        if ret <= 20 {
            return None;
        }
        let ppid = u32::from_ne_bytes([buf[16], buf[17], buf[18], buf[19]]) as i32;
        if ppid > 0 {
            Some(ppid)
        } else {
            None
        }
    }
}

fn get_process_cwd(pid: i32) -> Option<PathBuf> {
    unsafe {
        let mut buf = [0u8; 2352];
        let ret = proc_pidinfo(
            pid,
            PROC_PIDVNODEPATHINFO,
            0,
            buf.as_mut_ptr().cast::<c_void>(),
            buf.len() as i32,
        );
        if ret <= 152 {
            return None;
        }
        let path_bytes = &buf[152..];
        let len = path_bytes.iter().position(|&b| b == 0).unwrap_or(1024);
        let path_str = std::str::from_utf8(&path_bytes[..len]).ok()?;
        if path_str.is_empty() || path_str == "/" {
            None
        } else {
            Some(PathBuf::from(path_str))
        }
    }
}

fn get_descendant_cwds(parent_pid: i32) -> Vec<PathBuf> {
    let all_pids = get_all_pids();

    let mut children_map: HashMap<i32, Vec<i32>> = HashMap::new();
    for &pid in &all_pids {
        if let Some(ppid) = get_ppid(pid) {
            children_map.entry(ppid).or_default().push(pid);
        }
    }

    let mut queue = VecDeque::new();
    queue.push_back(parent_pid);
    let mut cwds = Vec::new();

    while let Some(pid) = queue.pop_front() {
        if let Some(cwd) = get_process_cwd(pid) {
            cwds.push(cwd);
        }
        if let Some(children) = children_map.get(&pid) {
            for &child in children {
                queue.push_back(child);
            }
        }
    }

    cwds.sort();
    cwds.dedup();
    cwds
}

// --- Workspace matching ---

/// Build a workspace ID from project name and branch, replacing `/` with `-`.
/// Kept identical to the original `toWorkspaceId()` in the band web server so
/// CWD/title matching produces stable identifiers.
fn to_workspace_id(project: &str, branch: &str) -> String {
    format!("{}-{}", project, branch.replace('/', "-"))
}

fn match_cwds_to_workspace(cwds: &[PathBuf], app_state: &state::AppState) -> Option<String> {
    let mut matches = Vec::new();

    for proj in &app_state.projects {
        for wt in &proj.worktrees {
            let wt_path = PathBuf::from(&wt.path);
            for cwd in cwds {
                if cwd == &wt_path || cwd.starts_with(&wt_path) {
                    let ws_id = to_workspace_id(&proj.name, &wt.branch);
                    if !matches.contains(&ws_id) {
                        matches.push(ws_id);
                    }
                    break;
                }
            }
        }
    }

    if matches.len() == 1 {
        matches.into_iter().next()
    } else {
        None
    }
}

fn set_active_workspace(
    app_handle: &tauri::AppHandle,
    active_state: &std::sync::Mutex<Option<String>>,
    workspace_id: &str,
) {
    let changed = if let Ok(mut guard) = active_state.lock() {
        let new_value = Some(workspace_id.to_string());
        if *guard == new_value {
            false
        } else {
            *guard = new_value;
            true
        }
    } else {
        false
    };
    if changed {
        let _ = app_handle.emit("active-workspace", workspace_id.to_string());
    }
}

fn is_panel_frontmost() -> bool {
    get_frontmost_window().is_some_and(|(pid, _)| pid as u32 == std::process::id())
}

fn workspace_info(
    workspace_id: &str,
    app_state: &state::AppState,
) -> Option<(String, String, String)> {
    for proj in &app_state.projects {
        for wt in &proj.worktrees {
            let ws_id = to_workspace_id(&proj.name, &wt.branch);
            if ws_id == workspace_id {
                let folder_name = Path::new(&wt.path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                return Some((wt.path.clone(), folder_name, proj.path.clone()));
            }
        }
    }
    None
}

fn detect_frontmost_workspace(app_state: &state::AppState) -> Option<String> {
    let (pid, cg_id, title) = ax_windows::get_frontmost_window_with_id()?;

    if pid as u32 == std::process::id() {
        return None;
    }

    if let Some(cg_id) = cg_id {
        if let Some((_app_type, workspace_id)) = WindowManager::global().find_by_cg_id(cg_id) {
            if find_workspace(&workspace_id, app_state).is_some() {
                return Some(workspace_id);
            }
        }
    }

    let cwds = get_descendant_cwds(pid);
    if let Some(ws_id) = match_cwds_to_workspace(&cwds, app_state) {
        return Some(ws_id);
    }

    if !title.is_empty() {
        if let Some(bundle_id) = get_bundle_id(pid) {
            let known = apps::all_known_bundle_ids();
            for (app_type, known_bundle_id) in &known {
                if bundle_id == *known_bundle_id {
                    if let Some(driver) = apps::get_handler(app_type) {
                        let mut best_match: Option<(String, usize)> = None;

                        for proj in &app_state.projects {
                            for wt in &proj.worktrees {
                                let folder_name = Path::new(&wt.path)
                                    .file_name()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("");

                                if !folder_name.is_empty()
                                    && driver.matches_window_title(&title, folder_name)
                                {
                                    let ws_id = to_workspace_id(&proj.name, &wt.branch);
                                    if best_match
                                        .as_ref()
                                        .is_none_or(|(_, len)| folder_name.len() > *len)
                                    {
                                        best_match = Some((ws_id, folder_name.len()));
                                    }
                                }
                            }
                        }

                        if let Some((ws_id, _)) = best_match {
                            return Some(ws_id);
                        }
                    }
                    break;
                }
            }
        }
    }

    None
}

/// Build a fresh `AppState` from the JSON store + live `git worktree list`.
/// Errors from individual `git` calls are logged but don't stop other projects
/// from being included.
fn refresh_project_cache(cache: &ProjectCache) -> Result<state::AppState, String> {
    let settings = store::load();
    let mut projects = Vec::with_capacity(settings.projects.len());
    for proj in &settings.projects {
        let wts = match worktrees::list(&proj.path) {
            Ok(w) => w,
            Err(e) => {
                log_debug(&format!(
                    "refresh_project_cache: git worktree list for {:?} failed: {e}",
                    proj.path
                ));
                Vec::new()
            }
        };
        projects.push(state::ProjectState {
            name: proj.name.clone(),
            path: proj.path.clone(),
            worktrees: wts,
        });
    }
    let app_state = state::AppState { projects };
    cache.set(app_state.clone());
    Ok(app_state)
}

fn find_workspace<'a>(
    workspace_id: &str,
    app_state: &'a state::AppState,
) -> Option<(&'a state::ProjectState, &'a state::WorktreeState)> {
    for proj in &app_state.projects {
        for wt in &proj.worktrees {
            if to_workspace_id(&proj.name, &wt.branch) == workspace_id {
                return Some((proj, wt));
            }
        }
    }
    None
}

/// Bring all panel windows to front without activating the app.
/// Uses `NSWindow`'s `orderFrontRegardless` to raise without stealing focus.
/// Must be called on the main thread.
unsafe fn raise_panel_windows() {
    type MsgSend = unsafe extern "C" fn(*const c_void, *const c_void) -> *const c_void;
    type MsgSendIdx = unsafe extern "C" fn(*const c_void, *const c_void, usize) -> *const c_void;
    type MsgSendCount = unsafe extern "C" fn(*const c_void, *const c_void) -> usize;
    type MsgSendBool = unsafe extern "C" fn(*const c_void, *const c_void) -> i8;

    let msg: MsgSend = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    let msg_idx: MsgSendIdx = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    let msg_count: MsgSendCount = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    let msg_bool: MsgSendBool = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());

    let cls = objc_getClass(c"NSApplication".as_ptr());
    if cls.is_null() {
        return;
    }

    let app = msg(cls, sel_registerName(c"sharedApplication".as_ptr()));
    if app.is_null() {
        return;
    }

    let windows = msg(app, sel_registerName(c"windows".as_ptr()));
    if windows.is_null() {
        return;
    }

    let count = msg_count(windows, sel_registerName(c"count".as_ptr()));
    let obj_at = sel_registerName(c"objectAtIndex:".as_ptr());
    let raise = sel_registerName(c"orderFrontRegardless".as_ptr());
    let is_visible = sel_registerName(c"isVisible".as_ptr());

    for i in 0..count {
        let win = msg_idx(windows, obj_at, i);
        if !win.is_null() && msg_bool(win, is_visible) != 0 {
            msg(win, raise);
        }
    }
}

/// Raise all workspace app windows.
pub fn raise_workspace_windows(workspace_id: &str, cache: &ProjectCache) {
    let Some(app_state) = cache.get() else {
        return;
    };
    let Some((worktree_path, _folder_name, proj_path)) = workspace_info(workspace_id, &app_state)
    else {
        return;
    };

    let app_configs = apps::load_apps_config(&worktree_path, &proj_path);

    if app_configs.is_empty() {
        return;
    }

    let wm = WindowManager::global();
    for app_config in &app_configs {
        wm.raise_window(app_config.app_type(), workspace_id);
    }
}

/// Background thread: poll the frontmost window every 500ms and emit
/// `active-workspace` events when the focused workspace changes.
/// Exits when `enabled` flips to `false`.
pub fn start_focus_polling(app_handle: tauri::AppHandle, enabled: Arc<AtomicBool>) {
    let active_state = {
        let s = app_handle.state::<ActiveWorkspaceState>();
        s.inner().0.clone()
    };
    let project_cache = {
        let s = app_handle.state::<ProjectCache>();
        s.inner().clone()
    };

    std::thread::spawn(move || {
        let mut last_active: Option<String> = None;
        let mut panel_raised = false;
        let mut apps_raised = false;
        let mut last_cache_refresh = std::time::Instant::now()
            .checked_sub(Duration::from_secs(10))
            .unwrap_or_else(std::time::Instant::now);
        let mut suppress_detection_until: Option<std::time::Instant> = None;

        loop {
            std::thread::sleep(Duration::from_millis(500));

            if !enabled.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }

            // Refresh project cache from disk (and `git worktree list`) every 5s.
            if last_cache_refresh.elapsed() >= Duration::from_secs(5) {
                last_cache_refresh = std::time::Instant::now();
                if let Err(e) = refresh_project_cache(&project_cache) {
                    log_debug(&format!("focus polling: refresh_project_cache failed: {e}"));
                }
            }

            let Some(cached) = project_cache.get() else {
                continue;
            };

            // Sync last_active from shared state (workspace_focus may have changed it).
            if let Ok(guard) = active_state.lock() {
                if *guard != last_active {
                    last_active.clone_from(&guard);
                    apps_raised = false;
                    suppress_detection_until =
                        Some(std::time::Instant::now() + Duration::from_secs(2));
                }
            }

            if suppress_detection_until.is_some_and(|t| std::time::Instant::now() < t) {
                continue;
            }
            suppress_detection_until = None;

            if let Some(ws_id) = detect_frontmost_workspace(&cached) {
                if last_active.as_deref() != Some(ws_id.as_str()) {
                    last_active = Some(ws_id.clone());
                    set_active_workspace(&app_handle, &active_state, &ws_id);
                }
                if !panel_raised {
                    let _ = app_handle.run_on_main_thread(|| unsafe {
                        raise_panel_windows();
                    });
                    panel_raised = true;
                }
                apps_raised = false;
            } else if is_panel_frontmost() {
                if !apps_raised {
                    if let Some(ref ws_id) = last_active {
                        raise_workspace_windows(ws_id, &project_cache);
                    }
                    apps_raised = true;
                }
                panel_raised = false;
            } else {
                panel_raised = false;
                apps_raised = false;
            }
        }
    });
}

#[tauri::command]
pub fn workspace_focus(
    workspace_id: String,
    app_handle: tauri::AppHandle,
    active_state: tauri::State<'_, ActiveWorkspaceState>,
    project_cache: tauri::State<'_, ProjectCache>,
    focus_state: tauri::State<'_, FocusManagementState>,
) -> Result<(), String> {
    use std::sync::Mutex;
    use std::time::Instant;

    static LAST_CALL: Mutex<Option<Instant>> = Mutex::new(None);

    if !focus_state.0.load(std::sync::atomic::Ordering::SeqCst) {
        return Ok(());
    }

    let mut last = LAST_CALL.lock().unwrap();
    if let Some(t) = *last {
        if t.elapsed() < Duration::from_millis(500) {
            log_debug("workspace_focus: debounced");
            return Ok(());
        }
    }
    *last = Some(Instant::now());
    drop(last);

    // Try cache first, refresh on miss.
    let app_state = match project_cache.get() {
        Some(s) => s,
        None => refresh_project_cache(&project_cache)
            .map_err(|e| format!("Could not load project state: {e}"))?,
    };

    let (wt_path, proj_path, ws_id) =
        if let Some((proj, wt)) = find_workspace(&workspace_id, &app_state) {
            (wt.path.clone(), proj.path.clone(), workspace_id.clone())
        } else {
            let fresh = refresh_project_cache(&project_cache)
                .map_err(|e| format!("Could not refresh project state: {e}"))?;
            if let Some((proj, wt)) = find_workspace(&workspace_id, &fresh) {
                (wt.path.clone(), proj.path.clone(), workspace_id.clone())
            } else {
                return Err(format!("Workspace '{workspace_id}' not found"));
            }
        };

    let folder_name = Path::new(&wt_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let app_configs = apps::load_apps_config(&wt_path, &proj_path);

    if app_configs.is_empty() {
        return Err("No apps configured for this workspace".to_string());
    }

    log_debug(&format!(
        "workspace_focus: id={ws_id}, folder_name={folder_name}, apps={}",
        app_configs.len()
    ));

    let (screen_width, screen_height) =
        ax_windows::get_screen_size().ok_or("Failed to get screen size")?;

    let panel_width = app_handle
        .get_webview_window("main")
        .and_then(|w| {
            let scale = w.scale_factor().unwrap_or(1.0);
            w.outer_size()
                .ok()
                .map(|s| (f64::from(s.width) / scale) as i32)
        })
        .unwrap_or(320);

    let rects = apps::compute_layout(&app_configs, screen_width, screen_height, panel_width);

    let wm = WindowManager::global();
    for (i, app_config) in app_configs.iter().enumerate() {
        if let Some(handler) = apps::get_handler(app_config.app_type()) {
            let config_json = app_config.to_json();
            let rect = rects[i].clone();
            let ws = ws_id.clone();
            let folder = folder_name.clone();
            let path = wt_path.clone();
            let app_type = app_config.app_type().to_string();
            std::thread::spawn(move || {
                let launched = match wm.open_or_focus(handler, &path, &ws, &folder, &config_json) {
                    Ok(v) => v,
                    Err(e) => {
                        log_debug(&format!("Failed to open {app_type}: {e}"));
                        return;
                    }
                };
                if let Err(e) =
                    wm.position_window(handler.app_type(), handler.display_name(), &ws, &rect)
                {
                    log_debug(&format!("Failed to position {app_type}: {e}"));
                }
                if launched {
                    if let Err(e) = handler.setup(&path, &folder, &config_json) {
                        log_debug(&format!("Failed to setup {app_type}: {e}"));
                    }
                }
            });
        }
    }

    set_active_workspace(&app_handle, &active_state.0, &ws_id);

    Ok(())
}

#[tauri::command]
pub fn workspace_close(
    workspace_id: String,
    _project_cache: tauri::State<'_, ProjectCache>,
) -> Result<(), String> {
    if workspace_id.is_empty() {
        return Ok(());
    }
    WindowManager::global().close_all_for_workspace(&workspace_id)
}

#[tauri::command]
pub fn get_active_workspace(
    active_state: tauri::State<'_, ActiveWorkspaceState>,
) -> Result<Option<String>, String> {
    Ok(active_state.0.lock().ok().and_then(|guard| guard.clone()))
}

#[tauri::command]
pub fn detect_active_workspace(
    app_handle: tauri::AppHandle,
    active_state: tauri::State<'_, ActiveWorkspaceState>,
    project_cache: tauri::State<'_, ProjectCache>,
) -> Result<Option<String>, String> {
    let Some(cached) = project_cache.get() else {
        return Ok(None);
    };
    if let Some(ws_id) = detect_frontmost_workspace(&cached) {
        set_active_workspace(&app_handle, &active_state.0, &ws_id);
        return Ok(Some(ws_id));
    }
    Ok(None)
}
