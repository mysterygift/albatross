//! Day pack email drafts on macOS, in whichever app handles `mailto:`:
//!
//! - Apple Mail: the "Compose Email" sharing service (`NSSharingService`), which needs no extra
//!   permission. It has no CC field, so CC addresses are added as recipients.
//! - Microsoft Outlook: Outlook's AppleScript dictionary (`make new outgoing message`) builds the
//!   draft with To, CC, body and attachments, then opens it. The first time, macOS asks the user to
//!   let Albatross control Outlook. The sharing service is no use here: it hands other apps only the
//!   recipients and subject.
//!
//! On iPad and iPhone see `mail_compose_ios`: the in-app mail composer, or the share sheet.
//!
//! Any other app, other platforms, or a route that fails return an error starting with
//! "unsupported" (with the reason after a colon); the front end then opens a `mailto:` draft.
//! Success returns how the draft ended: `opened` on macOS (the user sends from their mail app),
//! or the iOS outcome.
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Error prefix the front end treats as "use the mailto fallback".
#[cfg_attr(target_os = "ios", allow(dead_code))]
pub const UNSUPPORTED: &str = "unsupported";

#[cfg(target_os = "macos")]
const APPLE_MAIL: &str = "com.apple.mail";
#[cfg(target_os = "macos")]
const OUTLOOK: &str = "com.microsoft.outlook";

/// Attachments must be day pack files the app wrote itself (`<app data>/day-packs/...`).
fn validated_attachment_paths(app: &AppHandle, attachments: &[String]) -> Result<Vec<PathBuf>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data directory unavailable: {e}"))?;
    let root = app_data
        .join("day-packs")
        .canonicalize()
        .map_err(|_| "no day packs have been prepared".to_string())?;
    attachments
        .iter()
        .map(|raw| {
            let path = Path::new(raw)
                .canonicalize()
                .map_err(|_| format!("attachment not found: {raw}"))?;
            if path.starts_with(&root) && path.is_file() {
                Ok(path)
            } else {
                Err(format!("attachment outside the day-packs folder: {raw}"))
            }
        })
        .collect()
}

/// Bundle id (lower case) of the app that opens `mailto:` links.
#[cfg(target_os = "macos")]
fn default_mail_app() -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSBundle, NSString, NSURL};

    let probe = NSURL::URLWithString(&NSString::from_str("mailto:someone@example.com"))?;
    let app_url = NSWorkspace::sharedWorkspace().URLForApplicationToOpenURL(&probe)?;
    let id = NSBundle::bundleWithURL(&app_url)?.bundleIdentifier()?;
    Some(id.to_string().to_lowercase())
}

#[cfg(target_os = "macos")]
fn compose_in_apple_mail(
    recipients: Vec<String>,
    subject: String,
    body: String,
    attachments: Vec<PathBuf>,
) -> Result<(), String> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSSharingService, NSSharingServiceNameComposeEmail};
    use objc2_foundation::{NSArray, NSString, NSURL};

    // SAFETY: an AppKit-provided constant, valid for the life of the process.
    let name = unsafe { NSSharingServiceNameComposeEmail };
    let service = NSSharingService::sharingServiceNamed(name)
        .ok_or_else(|| format!("{UNSUPPORTED}: Mail's compose service is not available"))?;

    let recipients: Vec<Retained<NSString>> = recipients.iter().map(|r| NSString::from_str(r)).collect();
    service.setRecipients(Some(&NSArray::from_retained_slice(&recipients)));
    service.setSubject(Some(&NSString::from_str(&subject)));

    // Items: the body text first, then each file as a file URL (Mail attaches those).
    let mut items: Vec<Retained<AnyObject>> =
        vec![Retained::into_super(Retained::into_super(NSString::from_str(&body)))];
    for path in &attachments {
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        items.push(Retained::into_super(Retained::into_super(url)));
    }
    let items = NSArray::from_retained_slice(&items);

    // SAFETY: every item is an NSString or NSURL, both of which NSSharingService accepts.
    unsafe {
        if !service.canPerformWithItems(Some(&items)) {
            return Err(format!("{UNSUPPORTED}: Mail has no account set up"));
        }
        service.performWithItems(&items);
    }
    Ok(())
}

/// Values arrive as `argv`, never spliced into the script, so names and text cannot inject AppleScript.
/// Layout: subject, body, To count, To…, CC count, CC…, attachment paths….
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const OUTLOOK_SCRIPT: &str = r#"
on run argv
    set theSubject to item 1 of argv
    set theBody to item 2 of argv
    set toCount to (item 3 of argv) as integer
    set ccCount to (item (4 + toCount) of argv) as integer
    set theFiles to {}
    repeat with i from (5 + toCount + ccCount) to (count of argv)
        set end of theFiles to (POSIX file (item i of argv))
    end repeat
    tell application id "com.microsoft.Outlook"
        set msg to make new outgoing message with properties {subject:theSubject, plain text content:theBody}
        repeat with i from 1 to toCount
            make new to recipient at msg with properties {email address:{address:(item (3 + i) of argv)}}
        end repeat
        repeat with i from 1 to ccCount
            make new cc recipient at msg with properties {email address:{address:(item (4 + toCount + i) of argv)}}
        end repeat
        repeat with f in theFiles
            make new attachment at msg with properties {file:(contents of f)}
        end repeat
        open msg
        activate
    end tell
end run
"#;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn outlook_script_args(to: &[String], cc: &[String], subject: &str, body: &str, attachments: &[PathBuf]) -> Vec<String> {
    let mut args = vec![subject.to_string(), body.to_string(), to.len().to_string()];
    args.extend(to.iter().cloned());
    args.push(cc.len().to_string());
    args.extend(cc.iter().cloned());
    args.extend(attachments.iter().map(|p| p.to_string_lossy().into_owned()));
    args
}

#[cfg(target_os = "macos")]
fn compose_in_outlook(
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
    body: String,
    attachments: Vec<PathBuf>,
) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut child = Command::new("/usr/bin/osascript")
        .arg("-")
        .args(outlook_script_args(&to, &cc, &subject, &body, &attachments))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{UNSUPPORTED}: could not run osascript ({e})"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| format!("{UNSUPPORTED}: could not run osascript"))?
        .write_all(OUTLOOK_SCRIPT.as_bytes())
        .map_err(|e| format!("{UNSUPPORTED}: could not run osascript ({e})"))?;
    let output = child
        .wait_with_output()
        .map_err(|e| format!("{UNSUPPORTED}: could not run osascript ({e})"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.contains("-1743") {
        return Err(format!(
            "{UNSUPPORTED}: Albatross is not allowed to control Outlook. Allow it in System Settings → Privacy & Security → Automation, then try again"
        ));
    }
    Err(format!("{UNSUPPORTED}: Outlook could not create the draft ({stderr})"))
}

/// Opens one draft in the default mail app. See the module docs for how each app is driven.
#[tauri::command]
pub async fn compose_mail_draft(
    app: AppHandle,
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
    body: String,
    attachments: Vec<String>,
) -> Result<String, String> {
    #[cfg(target_os = "ios")]
    {
        let attachments = validated_attachment_paths(&app, &attachments)?;
        crate::mail_compose_ios::compose(app, to, cc, subject, body, attachments).await
    }
    #[cfg(target_os = "macos")]
    {
        let attachments = validated_attachment_paths(&app, &attachments)?;
        match default_mail_app().as_deref() {
            Some(APPLE_MAIL) => {
                let recipients: Vec<String> = to.into_iter().chain(cc).collect();
                let (tx, rx) = std::sync::mpsc::channel();
                app.run_on_main_thread(move || {
                    let _ = tx.send(compose_in_apple_mail(recipients, subject, body, attachments));
                })
                .map_err(|e| e.to_string())?;
                tauri::async_runtime::spawn_blocking(move || {
                    rx.recv_timeout(std::time::Duration::from_secs(20))
                        .map_err(|_| "Mail did not respond".to_string())?
                })
                .await
                .map_err(|e| e.to_string())??;
                Ok("opened".to_string())
            }
            Some(OUTLOOK) => {
                tauri::async_runtime::spawn_blocking(move || {
                    compose_in_outlook(to, cc, subject, body, attachments)
                })
                .await
                .map_err(|e| e.to_string())??;
                Ok("opened".to_string())
            }
            _ => Err(UNSUPPORTED.to_string()),
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = (&app, to, cc, subject, body);
        let _ = validated_attachment_paths;
        let _ = attachments;
        Err(UNSUPPORTED.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outlook_args_put_counts_before_each_address_list() {
        let args = outlook_script_args(
            &["ada@example.com".into()],
            &["agent@example.com".into(), "b@example.com".into()],
            "Subject",
            "Line one\nLine two",
            &[PathBuf::from("/tmp/a.pdf")],
        );
        assert_eq!(
            args,
            vec!["Subject", "Line one\nLine two", "1", "ada@example.com", "2", "agent@example.com", "b@example.com", "/tmp/a.pdf"]
        );
    }
}
