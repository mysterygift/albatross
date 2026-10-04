//! iOS `.apf` opening: tapping a file in the Files app, "Open in Albatross" from the share sheet,
//! Mail attachments and AirDrop all reach the app delegate's `application:openURL:options:`.
//!
//! tao turns that callback into `RunEvent::Opened` with a plain `file://` URL. That loses the
//! security scope iOS attaches to the original `NSURL`, so a file opened in place from the Files app
//! (`LSSupportsOpeningDocumentsInPlace`) can't be read from the URL alone. `install_open_url_hook`
//! wraps tao's delegate method to copy the file into the app sandbox while the scope is still
//! available; `on_run_event` then hands the sandbox copy to the frontend through the same queue and
//! `apf-open-request` event the desktop argv / single-instance path uses.
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::sel;
use objc2_foundation::NSURL;
use tauri::{AppHandle, Emitter, Manager, RunEvent};

use crate::apf_desktop::{ApfOpenPayload, ApfOpenQueue};

/// `(original path, sandbox copy)` for files staged by the delegate hook, waiting for `Opened`.
static STAGED: Mutex<Vec<(PathBuf, PathBuf)>> = Mutex::new(Vec::new());
static ORIGINAL_OPEN_URL: OnceLock<Imp> = OnceLock::new();

type OpenUrlFn =
    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut AnyObject) -> Bool;

fn is_apf(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("apf"))
        .unwrap_or(false)
}

/// Copies an opened `.apf` into `tmp/apf-open/` so the frontend can read it without a security scope.
fn copy_to_staging(src: &Path) -> std::io::Result<PathBuf> {
    let dir = std::env::temp_dir().join("apf-open");
    std::fs::create_dir_all(&dir)?;
    let name = src.file_name().unwrap_or_else(|| "project.apf".as_ref());
    let dest = dir.join(name);
    std::fs::copy(src, &dest)?;
    Ok(dest)
}

/// Files shared into the app (Mail, AirDrop, "Copy to") land in Documents/Inbox, which the Files
/// app would otherwise show; once copied they are no longer needed there.
fn is_in_documents_inbox(path: &Path) -> bool {
    let mut components = path.components().rev();
    components.next(); // file name
    matches!(
        (components.next(), components.next()),
        (Some(inbox), Some(documents)) if inbox.as_os_str() == "Inbox" && documents.as_os_str() == "Documents"
    )
}

fn stage_opened_url(url: &NSURL) {
    let Some(path) = url.path().map(|p| PathBuf::from(p.to_string())) else {
        return;
    };
    if !is_apf(&path) {
        return;
    }
    // SAFETY: plain Foundation calls on a valid NSURL; balanced below when access was granted.
    let accessing = unsafe { url.startAccessingSecurityScopedResource() };
    let copied = copy_to_staging(&path);
    if accessing {
        unsafe { url.stopAccessingSecurityScopedResource() };
    }
    match copied {
        Ok(staged) => {
            if is_in_documents_inbox(&path) {
                let _ = std::fs::remove_file(&path);
            }
            if let Ok(mut guard) = STAGED.lock() {
                guard.retain(|(original, _)| original != &path);
                guard.push((path, staged));
            }
        }
        Err(err) => log::warn!("could not copy opened .apf {}: {err}", path.display()),
    }
}

unsafe extern "C-unwind" fn hooked_open_url(
    this: *mut AnyObject,
    cmd: Sel,
    application: *mut AnyObject,
    url: *mut AnyObject,
    options: *mut AnyObject,
) -> Bool {
    // SAFETY: UIKit passes an NSURL (or nil) as the `openURL:` argument.
    if let Some(url) = unsafe { url.cast::<NSURL>().as_ref() } {
        stage_opened_url(url);
    }
    match ORIGINAL_OPEN_URL.get() {
        Some(original) => {
            // SAFETY: `original` is tao's implementation of this same selector and signature.
            let original: OpenUrlFn = unsafe { std::mem::transmute::<Imp, OpenUrlFn>(*original) };
            unsafe { original(this, cmd, application, url, options) }
        }
        None => Bool::YES,
    }
}

/// Wraps tao's `AppDelegate application:openURL:options:`. Call after the Tauri app is built (the
/// event loop registers the delegate class) and before `run` (which starts `UIApplicationMain`).
pub fn install_open_url_hook() {
    if ORIGINAL_OPEN_URL.get().is_some() {
        return;
    }
    let Some(class) = AnyClass::get(c"AppDelegate") else {
        log::warn!("AppDelegate class not found; opening .apf files from the Files app may fail");
        return;
    };
    let Some(method) = class.instance_method(sel!(application:openURL:options:)) else {
        log::warn!("AppDelegate has no application:openURL:options:; .apf opening is unavailable");
        return;
    };
    let hook: OpenUrlFn = hooked_open_url;
    // SAFETY: the replacement has the exact signature of the method it replaces.
    let previous = unsafe { method.set_implementation(std::mem::transmute::<OpenUrlFn, Imp>(hook)) };
    let _ = ORIGINAL_OPEN_URL.set(previous);
}

fn take_staged_copy(path: &Path) -> Option<PathBuf> {
    let mut guard = STAGED.lock().ok()?;
    let index = guard
        .iter()
        .position(|(original, _)| original == path)
        // Fall back to the file name in case the two path spellings differ (e.g. /private/var).
        .or_else(|| guard.iter().position(|(original, _)| original.file_name() == path.file_name()))?;
    Some(guard.remove(index).1)
}

/// Queues opened `.apf` files and notifies the frontend. The queue covers a cold start (or the
/// sign-in screen), when nothing is listening yet; the frontend drains it on each event.
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    let RunEvent::Opened { urls } = event else {
        return;
    };
    let mut paths = Vec::new();
    for url in urls {
        let Ok(path) = url.to_file_path() else {
            continue;
        };
        if !is_apf(&path) {
            continue;
        }
        let readable = take_staged_copy(&path).unwrap_or(path);
        paths.push(readable.to_string_lossy().into_owned());
    }
    if paths.is_empty() {
        return;
    }
    if let Some(queue) = app.try_state::<ApfOpenQueue>() {
        if let Ok(mut pending) = queue.0.lock() {
            for path in &paths {
                if !pending.contains(path) {
                    pending.push(path.clone());
                }
            }
        }
    }
    let _ = app.emit("apf-open-request", ApfOpenPayload { paths });
}

