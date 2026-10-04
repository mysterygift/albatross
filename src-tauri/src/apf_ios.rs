//! iOS `.apf` opening: tapping a file in the Files app, "Open in Albatross" from the share sheet,
//! Mail attachments and AirDrop all reach the app delegate's `application:openURL:options:`, or,
//! when the file launches the app, `application:didFinishLaunchingWithOptions:`.
//!
//! tao turns `openURL:` into `RunEvent::Opened` with a plain `file://` URL. That loses the
//! security scope iOS attaches to the original `NSURL`, so a file opened in place from the Files app
//! (`LSSupportsOpeningDocumentsInPlace`) can't be read from the URL alone. `install_open_url_hook`
//! wraps tao's delegate methods to copy the file into the app sandbox while the scope is still
//! available; `on_run_event` then hands the sandbox copy to the frontend through the same queue and
//! `apf-open-request` event the desktop argv / single-instance path uses.
//!
//! On a cold start iOS passes the URL in `launchOptions` and (seen on iOS 18) does not follow up
//! with `openURL:`, and tao ignores `launchOptions`, so there is no `Opened` event for that file.
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::{msg_send, sel, ClassType};
use objc2_foundation::{NSString, NSURL};
use tauri::{AppHandle, Emitter, Manager, RunEvent};

use crate::apf_desktop::{ApfOpenPayload, ApfOpenQueue};

/// `(original path, sandbox copy)` for files staged by the `openURL:` hook, waiting for `Opened`.
static STAGED: Mutex<Vec<(PathBuf, PathBuf)>> = Mutex::new(Vec::new());
/// `(original path, sandbox copy)` for a file the app was launched to open, waiting for the queue.
static LAUNCH_STAGED: Mutex<Vec<(PathBuf, PathBuf)>> = Mutex::new(Vec::new());
/// Originals already delivered from `launchOptions`, so a later `Opened` for them is ignored.
static LAUNCH_DELIVERED: Mutex<Vec<PathBuf>> = Mutex::new(Vec::new());
static ORIGINAL_OPEN_URL: OnceLock<Imp> = OnceLock::new();
static ORIGINAL_DID_FINISH_LAUNCHING: OnceLock<Imp> = OnceLock::new();

type OpenUrlFn =
    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut AnyObject) -> Bool;
type DidFinishLaunchingFn =
    unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut AnyObject) -> Bool;

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

/// Copies an opened `.apf` into the sandbox; returns `(original path, sandbox copy)`.
fn stage_opened_url(url: &NSURL) -> Option<(PathBuf, PathBuf)> {
    let path = url.path().map(|p| PathBuf::from(p.to_string()))?;
    if !is_apf(&path) {
        return None;
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
            Some((path, staged))
        }
        Err(err) => {
            log::warn!("could not copy opened .apf {}: {err}", path.display());
            None
        }
    }
}

fn push_staged(list: &Mutex<Vec<(PathBuf, PathBuf)>>, entry: (PathBuf, PathBuf)) {
    if let Ok(mut guard) = list.lock() {
        guard.retain(|(original, _)| original != &entry.0);
        guard.push(entry);
    }
}

/// `launchOptions[UIApplicationLaunchOptionsURLKey]`, if it is an `NSURL`.
///
/// # Safety
/// `options` must be nil or the `NSDictionary` UIKit passes to `didFinishLaunchingWithOptions:`.
unsafe fn launch_options_url<'a>(options: *mut AnyObject) -> Option<&'a NSURL> {
    let options = unsafe { options.as_ref() }?;
    let key = NSString::from_str("UIApplicationLaunchOptionsURLKey");
    let value: *mut AnyObject = unsafe { msg_send![options, objectForKey: &*key] };
    let value = unsafe { value.as_ref() }?;
    let is_url: bool = unsafe { msg_send![value, isKindOfClass: NSURL::class()] };
    if !is_url {
        return None;
    }
    // SAFETY: checked above that the object is an NSURL.
    Some(unsafe { &*(value as *const AnyObject).cast::<NSURL>() })
}

unsafe extern "C-unwind" fn hooked_did_finish_launching(
    this: *mut AnyObject,
    cmd: Sel,
    application: *mut AnyObject,
    options: *mut AnyObject,
) -> Bool {
    // Stage before tao's handler runs: it starts the event loop, which may deliver events at once.
    if let Some(url) = unsafe { launch_options_url(options) } {
        if let Some(entry) = stage_opened_url(url) {
            push_staged(&LAUNCH_STAGED, entry);
        }
    }
    match ORIGINAL_DID_FINISH_LAUNCHING.get() {
        Some(original) => {
            // SAFETY: `original` is tao's implementation of this same selector and signature.
            let original: DidFinishLaunchingFn =
                unsafe { std::mem::transmute::<Imp, DidFinishLaunchingFn>(*original) };
            unsafe { original(this, cmd, application, options) }
        }
        None => Bool::YES,
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
        if let Some(entry) = stage_opened_url(url) {
            push_staged(&STAGED, entry);
        }
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

/// Wraps tao's `AppDelegate` `application:openURL:options:` and
/// `application:didFinishLaunchingWithOptions:`. Call after the Tauri app is built (the event loop
/// registers the delegate class) and before `run` (which starts `UIApplicationMain`).
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

    let Some(method) = class.instance_method(sel!(application:didFinishLaunchingWithOptions:)) else {
        log::warn!("AppDelegate has no didFinishLaunchingWithOptions:; .apf files can't launch the app");
        return;
    };
    let hook: DidFinishLaunchingFn = hooked_did_finish_launching;
    // SAFETY: the replacement has the exact signature of the method it replaces.
    let previous =
        unsafe { method.set_implementation(std::mem::transmute::<DidFinishLaunchingFn, Imp>(hook)) };
    let _ = ORIGINAL_DID_FINISH_LAUNCHING.set(previous);
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

/// True (once) when `path` was already delivered from `launchOptions`.
fn take_launch_delivered(path: &Path) -> bool {
    let Ok(mut guard) = LAUNCH_DELIVERED.lock() else {
        return false;
    };
    let index = guard
        .iter()
        .position(|original| original == path)
        .or_else(|| guard.iter().position(|original| original.file_name() == path.file_name()));
    match index {
        Some(index) => {
            guard.remove(index);
            true
        }
        None => false,
    }
}

/// Queues paths for the frontend (which drains the queue on mount and on each event) and emits
/// `apf-open-request`. Returns false when the queue isn't managed yet (before setup has run).
fn queue_and_emit(app: &AppHandle, paths: Vec<String>) -> bool {
    let Some(queue) = app.try_state::<ApfOpenQueue>() else {
        return false;
    };
    if let Ok(mut pending) = queue.0.lock() {
        for path in &paths {
            if !pending.contains(path) {
                pending.push(path.clone());
            }
        }
    }
    let _ = app.emit("apf-open-request", ApfOpenPayload { paths });
    true
}

/// Hands a file the app was launched to open to the frontend once the queue exists.
fn flush_launch_staged(app: &AppHandle) {
    let Ok(mut guard) = LAUNCH_STAGED.lock() else {
        return;
    };
    if guard.is_empty() || app.try_state::<ApfOpenQueue>().is_none() {
        return;
    }
    let entries = std::mem::take(&mut *guard);
    drop(guard);
    let paths = entries
        .iter()
        .map(|(_, staged)| staged.to_string_lossy().into_owned())
        .collect();
    if let Ok(mut delivered) = LAUNCH_DELIVERED.lock() {
        delivered.extend(entries.into_iter().map(|(original, _)| original));
    }
    queue_and_emit(app, paths);
}

/// Queues opened `.apf` files and notifies the frontend. The queue covers a cold start (or the
/// sign-in screen), when nothing is listening yet; the frontend drains it on each event.
pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    flush_launch_staged(app);

    let RunEvent::Opened { urls } = event else {
        return;
    };
    let mut paths = Vec::new();
    for url in urls {
        let Ok(path) = url.to_file_path() else {
            continue;
        };
        if !is_apf(&path) || take_launch_delivered(&path) {
            continue;
        }
        let readable = take_staged_copy(&path).unwrap_or(path);
        paths.push(readable.to_string_lossy().into_owned());
    }
    if !paths.is_empty() {
        queue_and_emit(app, paths);
    }
}
