//! Day pack email drafts on iPad and iPhone.
//!
//! - A Mail account is set up (`MFMailComposeViewController.canSendMail`): the in-app mail composer,
//!   with To, CC, subject, body and the PDFs attached. The command resolves when the user sends,
//!   saves or cancels, so "Open all drafts" shows one composer at a time.
//! - Otherwise (for example Outlook only): the share sheet with the body text, the subject and the
//!   PDFs. Picking Outlook (or any mail app) there starts a draft with the files; the share sheet
//!   cannot fill in recipients, so their addresses are put on the clipboard first.
//!
//! Outcomes, returned as text: `sent`, `saved`, `cancelled`, `failed` (composer), or
//! `share:completed` / `share:cancelled` (share sheet).
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Mutex, OnceLock};

use block2::RcBlock;
use objc2::encode::{Encode, Encoding};
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Bool, NSObject};
use objc2::{define_class, msg_send, ClassType};
use objc2_foundation::{NSArray, NSString, NSURL};
use tauri::{AppHandle, Manager};

// MFMailComposeViewController lives in MessageUI, which nothing else links.
#[link(name = "MessageUI", kind = "framework")]
extern "C" {}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGSize {
    width: f64,
    height: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct CGRect {
    origin: CGPoint,
    size: CGSize,
}

unsafe impl Encode for CGPoint {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl Encode for CGSize {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}
unsafe impl Encode for CGRect {
    const ENCODING: Encoding = Encoding::Struct("CGRect", &[CGPoint::ENCODING, CGSize::ENCODING]);
}

/// Where the open composer or share sheet reports how it ended. One sheet at a time.
static FINISHED: Mutex<Option<mpsc::Sender<Result<String, String>>>> = Mutex::new(None);

fn finish(outcome: Result<String, String>) {
    if let Some(tx) = FINISHED.lock().unwrap_or_else(|e| e.into_inner()).take() {
        let _ = tx.send(outcome);
    }
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements and this class does not implement Drop.
    #[unsafe(super(NSObject))]
    #[name = "AlbatrossMailComposeDelegate"]
    struct MailComposeDelegate;

    impl MailComposeDelegate {
        /// MFMailComposeViewControllerDelegate: dismiss the composer and report the result.
        #[unsafe(method(mailComposeController:didFinishWithResult:error:))]
        fn did_finish(&self, controller: *mut AnyObject, result: isize, _error: *mut AnyObject) {
            if let Some(controller) = unsafe { controller.as_ref() } {
                let _: () = unsafe {
                    msg_send![controller, dismissViewControllerAnimated: true, completion: std::ptr::null::<AnyObject>()]
                };
            }
            // MFMailComposeResult: 0 cancelled, 1 saved, 2 sent, 3 failed.
            let outcome = match result {
                0 => "cancelled",
                1 => "saved",
                2 => "sent",
                _ => "failed",
            };
            finish(Ok(outcome.to_string()));
        }
    }
);

/// The composer holds its delegate weakly, so one delegate lives for the life of the app.
fn delegate() -> *mut AnyObject {
    static DELEGATE: OnceLock<usize> = OnceLock::new();
    *DELEGATE.get_or_init(|| {
        let delegate: Retained<MailComposeDelegate> = unsafe { msg_send![MailComposeDelegate::class(), new] };
        Retained::into_raw(delegate) as usize
    }) as *mut AnyObject
}

fn ns_strings(values: &[String]) -> Retained<NSArray<NSString>> {
    let items: Vec<Retained<NSString>> = values.iter().map(|v| NSString::from_str(v)).collect();
    NSArray::from_retained_slice(&items)
}

/// The view controller on top of the webview's, which is the one that can present.
unsafe fn top_view_controller(root: *mut AnyObject) -> Option<&'static AnyObject> {
    let mut top = unsafe { root.as_ref() }?;
    loop {
        let presented: *mut AnyObject = unsafe { msg_send![top, presentedViewController] };
        match unsafe { presented.as_ref() } {
            Some(next) => top = next,
            None => return Some(top),
        }
    }
}

fn is_kind_of(object: &AnyObject, class_name: &std::ffi::CStr) -> bool {
    AnyClass::get(class_name).is_some_and(|class| {
        let is: bool = unsafe { msg_send![object, isKindOfClass: class] };
        is
    })
}

struct Draft {
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
    body: String,
    attachments: Vec<PathBuf>,
}

unsafe fn present_composer(presenter: &AnyObject, class: &AnyClass, draft: &Draft) -> Result<(), String> {
    let composer: Option<Retained<AnyObject>> = unsafe { msg_send![class, new] };
    let composer = composer.ok_or("could not create the mail composer")?;
    unsafe {
        let _: () = msg_send![&*composer, setMailComposeDelegate: delegate()];
        let _: () = msg_send![&*composer, setToRecipients: &*ns_strings(&draft.to)];
        if !draft.cc.is_empty() {
            let _: () = msg_send![&*composer, setCcRecipients: &*ns_strings(&draft.cc)];
        }
        let _: () = msg_send![&*composer, setSubject: &*NSString::from_str(&draft.subject)];
        let _: () = msg_send![&*composer, setMessageBody: &*NSString::from_str(&draft.body), isHTML: false];
        let data_class = AnyClass::get(c"NSData").ok_or("NSData unavailable")?;
        let mime = NSString::from_str("application/pdf");
        for path in &draft.attachments {
            let path_str = NSString::from_str(&path.to_string_lossy());
            let data: Option<Retained<AnyObject>> = msg_send![data_class, dataWithContentsOfFile: &*path_str];
            let data = data.ok_or_else(|| format!("could not read {}", path.display()))?;
            let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let _: () = msg_send![&*composer, addAttachmentData: &*data, mimeType: &*mime, fileName: &*NSString::from_str(&file_name)];
        }
        let _: () = msg_send![presenter, presentViewController: &*composer, animated: true, completion: std::ptr::null::<AnyObject>()];
    }
    Ok(())
}

unsafe fn present_share_sheet(presenter: &AnyObject, draft: &Draft) -> Result<(), String> {
    // The share sheet cannot fill in recipients: put them on the clipboard to paste into To.
    if let Some(pasteboard_class) = AnyClass::get(c"UIPasteboard") {
        let pasteboard: *mut AnyObject = unsafe { msg_send![pasteboard_class, generalPasteboard] };
        if let Some(pasteboard) = unsafe { pasteboard.as_ref() } {
            let addresses = NSString::from_str(&draft.to.join(", "));
            let _: () = unsafe { msg_send![pasteboard, setString: &*addresses] };
        }
    }

    let mut items: Vec<Retained<AnyObject>> =
        vec![Retained::into_super(Retained::into_super(NSString::from_str(&draft.body)))];
    for path in &draft.attachments {
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        items.push(Retained::into_super(Retained::into_super(url)));
    }
    let items = NSArray::from_retained_slice(&items);

    let class = AnyClass::get(c"UIActivityViewController").ok_or("share sheet unavailable")?;
    unsafe {
        let sheet: Option<Retained<AnyObject>> = msg_send![msg_send![class, alloc], initWithActivityItems: &*items, applicationActivities: std::ptr::null::<AnyObject>()];
        let sheet = sheet.ok_or("could not create the share sheet")?;
        // Mail (and some other apps) use this as the subject.
        let _: () = msg_send![&*sheet, setValue: &*NSString::from_str(&draft.subject), forKey: &*NSString::from_str("subject")];

        let handler = RcBlock::new(|_activity: *mut AnyObject, completed: Bool, _items: *mut AnyObject, error: *mut AnyObject| {
            let outcome = if !error.is_null() {
                "share:failed"
            } else if completed.as_bool() {
                "share:completed"
            } else {
                "share:cancelled"
            };
            finish(Ok(outcome.to_string()));
        });
        let _: () = msg_send![&*sheet, setCompletionWithItemsHandler: &*handler];

        // On iPad the share sheet is a popover and must be anchored, or presenting it crashes.
        let popover: *mut AnyObject = msg_send![&*sheet, popoverPresentationController];
        if let Some(popover) = popover.as_ref() {
            let view: *mut AnyObject = msg_send![presenter, view];
            if let Some(view) = view.as_ref() {
                let bounds: CGRect = msg_send![view, bounds];
                let anchor = CGRect {
                    origin: CGPoint { x: bounds.size.width / 2.0, y: bounds.size.height / 2.0 },
                    size: CGSize { width: 1.0, height: 1.0 },
                };
                let _: () = msg_send![popover, setSourceView: view];
                let _: () = msg_send![popover, setSourceRect: anchor];
                let _: () = msg_send![popover, setPermittedArrowDirections: 0usize];
            }
        }
        let _: () = msg_send![presenter, presentViewController: &*sheet, animated: true, completion: std::ptr::null::<AnyObject>()];
    }
    Ok(())
}

pub async fn compose(
    app: AppHandle,
    to: Vec<String>,
    cc: Vec<String>,
    subject: String,
    body: String,
    attachments: Vec<PathBuf>,
) -> Result<String, String> {
    let window = app.get_webview_window("main").ok_or("main window not found")?;
    let (tx, rx) = mpsc::channel();
    *FINISHED.lock().unwrap_or_else(|e| e.into_inner()) = Some(tx.clone());
    let draft = Draft { to, cc, subject, body, attachments };

    window
        .with_webview(move |webview| {
            let result = unsafe {
                match top_view_controller(webview.view_controller() as *mut AnyObject) {
                    None => Err("no view to present from".to_string()),
                    Some(top) if is_kind_of(top, c"MFMailComposeViewController")
                        || is_kind_of(top, c"UIActivityViewController") =>
                    {
                        Err("Another draft is still open. Send or cancel it first".to_string())
                    }
                    Some(top) => match AnyClass::get(c"MFMailComposeViewController") {
                        Some(class) if {
                            let can: bool = msg_send![class, canSendMail];
                            can
                        } =>
                        {
                            present_composer(top, class, &draft)
                        }
                        _ => present_share_sheet(top, &draft),
                    },
                }
            };
            // A presentation that never happened will never report back: report the error now.
            if let Err(message) = result {
                finish(Err(message));
            }
        })
        .map_err(|e| e.to_string())?;
    drop(tx);

    tauri::async_runtime::spawn_blocking(move || {
        // Generous: the user is writing or checking the email.
        rx.recv_timeout(std::time::Duration::from_secs(60 * 60))
            .map_err(|_| "The draft did not report back".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}
