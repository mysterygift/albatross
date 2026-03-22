//! Desktop `.apf` open routing: argv queue (cold start), single-instance handoff, fs scope grant.
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_fs::FsExt;

#[derive(Clone, Serialize)]
pub struct ApfOpenPayload {
    pub paths: Vec<String>,
}

pub struct ApfOpenQueue(pub Mutex<Vec<String>>);

fn is_apf_extension(path: &Path) -> bool {
    path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("apf"))
        .unwrap_or(false)
}

fn normalize_os_arg(s: &str) -> String {
    s.trim_matches('"').trim().to_string()
}

pub fn collect_apf_paths_from_os_args<I>(args: I) -> Vec<String>
where
    I: Iterator<Item = std::ffi::OsString>,
{
    let mut out = Vec::new();
    for arg in args {
        let s = normalize_os_arg(&arg.to_string_lossy());
        if s.is_empty() {
            continue;
        }
        let p = PathBuf::from(&s);
        if is_apf_extension(&p) && !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

pub fn collect_apf_paths_from_argv_strings(argv: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for arg in argv {
        let s = normalize_os_arg(arg);
        if s.is_empty() {
            continue;
        }
        let p = PathBuf::from(&s);
        if is_apf_extension(&p) && !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

#[tauri::command]
pub fn pop_pending_apf_open_paths(queue: State<'_, ApfOpenQueue>) -> Vec<String> {
    let mut g = queue.0.lock().expect("apf queue poisoned");
    std::mem::take(&mut *g)
}

/// Extends the fs plugin read scope so `readFile` can open an OS-supplied `.apf` path.
#[tauri::command]
pub fn grant_read_access_for_apf(app: AppHandle, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    let p = Path::new(trimmed);
    if !is_apf_extension(p) {
        return Err("Path must be a .apf file".into());
    }
    app.fs_scope()
        .allow_file(p)
        .map_err(|e| e.to_string())
}

pub fn on_second_instance(app: &AppHandle, argv: &[String]) {
    let paths = collect_apf_paths_from_argv_strings(argv);
    if paths.is_empty() {
        return;
    }
    let _ = app.emit(
        "apf-open-request",
        ApfOpenPayload {
            paths: paths.clone(),
        },
    );
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_focus();
    }
}
