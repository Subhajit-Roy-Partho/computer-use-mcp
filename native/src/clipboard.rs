// ── macOS: text goes through pbcopy/pbpaste in the session layer ─────────────
//
// 7.7.0 (K9): one native question on every platform, `clipboard_has_non_text`. Pasting long text saves the
// clipboard's text and restores it afterwards; when the clipboard held an image or a list of files, there was no text
// to save, and the restore left the person with empty text instead of what they had copied. The session asks first
// and types the text instead of pasting it when the clipboard holds something else.

#[cfg(target_os = "macos")]
mod macos {
    use napi_derive::napi;
    use objc::runtime::Object;
    use objc::{class, msg_send, sel, sel_impl};

    /// Pasteboard types that are not text: images, PDFs and files.
    fn is_non_text(kind: &str) -> bool {
        kind.starts_with("public.image") || kind == "public.tiff" || kind == "public.png" || kind == "public.jpeg"
            || kind == "public.heic" || kind == "com.adobe.pdf" || kind == "public.file-url"
            || kind == "NSFilenamesPboardType" || kind.starts_with("com.apple.pasteboard.promised")
    }

    #[napi]
    pub fn clipboard_has_non_text() -> bool {
        objc::rc::autoreleasepool(|| unsafe {
            let pasteboard: *mut Object = msg_send![class!(NSPasteboard), generalPasteboard];
            if pasteboard.is_null() {
                return false;
            }
            let types: *mut Object = msg_send![pasteboard, types];
            if types.is_null() {
                return false;
            }
            let count: usize = msg_send![types, count];
            (0..count).any(|index| {
                let kind: *mut Object = msg_send![types, objectAtIndex: index];
                let utf8: *const std::os::raw::c_char = msg_send![kind, UTF8String];
                !utf8.is_null() && is_non_text(&std::ffi::CStr::from_ptr(utf8).to_string_lossy())
            })
        })
    }
}

// ── Linux implementation ─────────────────────────────────────────────────────
#[cfg(target_os = "linux")]
mod linux {
    use napi_derive::napi;
    use std::process::Command;
    use std::sync::OnceLock;

    static IS_WAYLAND: OnceLock<bool> = OnceLock::new();

    fn is_wayland() -> bool {
        *IS_WAYLAND.get_or_init(|| {
            std::env::var("XDG_SESSION_TYPE")
                .map(|v| v == "wayland")
                .unwrap_or(false)
        })
    }

    #[napi]
    pub fn read_clipboard() -> napi::Result<String> {
        let output = if is_wayland() {
            Command::new("wl-paste")
                .args(["--no-newline"])
                .output()
                .or_else(|_| {
                    Command::new("xclip")
                        .args(["-selection", "clipboard", "-o"])
                        .output()
                })
        } else {
            Command::new("xclip")
                .args(["-selection", "clipboard", "-o"])
                .output()
                .or_else(|_| {
                    Command::new("xsel")
                        .args(["--clipboard", "--output"])
                        .output()
                })
        };
        let output = output.map_err(|e| {
            napi::Error::from_reason(format!(
                "clipboard read failed (install wl-clipboard or xclip): {e}"
            ))
        })?;
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    /// The clipboard holds an image or files (7.7.0, K9). Unknown (no tool) reads as text only.
    #[napi]
    pub fn clipboard_has_non_text() -> bool {
        let listed = if is_wayland() {
            crate::linux_tools::output("wl-paste", &["--list-types"])
        } else {
            crate::linux_tools::output("xclip", &["-selection", "clipboard", "-o", "-t", "TARGETS"])
        };
        match listed {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).lines().any(|kind| {
                let kind = kind.trim();
                kind.starts_with("image/") || kind == "text/uri-list" || kind == "x-special/gnome-copied-files"
                    || kind == "application/pdf"
            }),
            _ => false,
        }
    }

    #[napi]
    pub fn write_clipboard(text: String) -> napi::Result<()> {
        if is_wayland() {
            // wl-copy works best with text as argument. 7.7.0 (L1): it forks a server that keeps the selection, so it
            // must never hold this process's stdout (the MCP channel).
            let status = Command::new("wl-copy")
                .arg(&text)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status()
                .map_err(|e| napi::Error::from_reason(format!("wl-copy failed (install wl-clipboard): {e}")))?;
            if status.success() {
                return Ok(());
            }
        }
        // X11 fallback: pipe to xclip, which stays running to serve the selection; never with our stdout (L1).
        use std::io::Write;
        let child = Command::new("xclip")
            .args(["-selection", "clipboard"])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .or_else(|_| {
                Command::new("xsel")
                    .args(["--clipboard", "--input"])
                    .stdin(std::process::Stdio::piped())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
            });
        let mut child = child.map_err(|e| {
            napi::Error::from_reason(format!(
                "clipboard write failed (install wl-clipboard or xclip): {e}"
            ))
        })?;
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(text.as_bytes())
                .map_err(|e| napi::Error::from_reason(format!("write: {e}")))?;
        }
        child
            .wait()
            .map_err(|e| napi::Error::from_reason(format!("wait: {e}")))?;
        Ok(())
    }
}

// ── Windows implementation ───────────────────────────────────────────────────
#[cfg(target_os = "windows")]
mod win {
    use napi_derive::napi;
    use windows::Win32::Foundation::*;
    use windows::Win32::System::DataExchange::*;
    use windows::Win32::System::Memory::*;
    use windows::Win32::System::Ole::CF_UNICODETEXT;

    /// The clipboard holds an image, a file list or a metafile (7.7.0, K9).
    #[napi]
    pub fn clipboard_has_non_text() -> bool {
        // CF_BITMAP 2, CF_TIFF 6, CF_DIB 8, CF_ENHMETAFILE 14, CF_HDROP 15, CF_DIBV5 17, and the registered "PNG".
        let png = unsafe { RegisterClipboardFormatW(windows::core::w!("PNG")) };
        [2u32, 6, 8, 14, 15, 17, png]
            .into_iter()
            .filter(|format| *format != 0)
            .any(|format| unsafe { IsClipboardFormatAvailable(format).is_ok() })
    }

    const MAX_RETRIES: u32 = 3;
    const RETRY_DELAY_MS: u64 = 50;

    #[napi]
    pub fn read_clipboard() -> napi::Result<String> {
        unsafe {
            for attempt in 0..MAX_RETRIES {
                if OpenClipboard(HWND::default()).is_ok() {
                    let handle = GetClipboardData(CF_UNICODETEXT.0 as u32);
                    let text = match handle {
                        Ok(h) if !h.0.is_null() => {
                            let ptr = GlobalLock(HGLOBAL(h.0)) as *const u16;
                            if ptr.is_null() {
                                String::new()
                            } else {
                                let mut len = 0;
                                while *ptr.add(len) != 0 {
                                    len += 1;
                                }
                                let slice = std::slice::from_raw_parts(ptr, len);
                                let s = String::from_utf16_lossy(slice);
                                let _ = GlobalUnlock(HGLOBAL(h.0));
                                s
                            }
                        }
                        _ => String::new(),
                    };
                    let _ = CloseClipboard();
                    return Ok(text);
                }
                if attempt < MAX_RETRIES - 1 {
                    std::thread::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS));
                }
            }
            Err(napi::Error::from_reason(
                "clipboard_locked: could not open clipboard after 3 retries",
            ))
        }
    }

    #[napi]
    pub fn write_clipboard(text: String) -> napi::Result<()> {
        // Windows clipboard text (CF_UNICODETEXT) uses CRLF line endings. Editors
        // like Notepad render a lone LF inconsistently (often as no break), so
        // normalize: turn every LF that is not already preceded by CR into CRLF
        // without doubling existing CRLF pairs.
        let mut normalized = String::with_capacity(text.len() + 8);
        let mut prev = '\0';
        for ch in text.chars() {
            if ch == '\n' && prev != '\r' {
                normalized.push('\r');
            }
            normalized.push(ch);
            prev = ch;
        }
        let wide: Vec<u16> = normalized
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let byte_len = wide.len() * 2;

        unsafe {
            for attempt in 0..MAX_RETRIES {
                if OpenClipboard(HWND::default()).is_ok() {
                    let _ = EmptyClipboard();
                    let hmem = GlobalAlloc(GMEM_MOVEABLE, byte_len)
                        .map_err(|e| napi::Error::from_reason(format!("GlobalAlloc: {e}")))?;
                    let ptr = GlobalLock(hmem) as *mut u16;
                    if ptr.is_null() {
                        let _ = GlobalFree(hmem);
                        let _ = CloseClipboard();
                        return Err(napi::Error::from_reason("GlobalLock returned null"));
                    }
                    std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
                    let _ = GlobalUnlock(hmem);
                    // 7.6.1: the result used to be discarded, so a failed set left the clipboard empty (EmptyClipboard
                    // above) and the tool reported "Written"; a long `type` then pasted nothing and reported "Typed".
                    match SetClipboardData(CF_UNICODETEXT.0 as u32, HANDLE(hmem.0)) {
                        Ok(_) => {
                            let _ = CloseClipboard();
                            return Ok(());
                        }
                        Err(error) => {
                            // The system owns the handle only after a successful SetClipboardData.
                            let _ = GlobalFree(hmem);
                            let _ = CloseClipboard();
                            return Err(napi::Error::from_reason(format!(
                                "SetClipboardData failed; the clipboard is now empty: {error}"
                            )));
                        }
                    }
                }
                if attempt < MAX_RETRIES - 1 {
                    std::thread::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS));
                }
            }
            Err(napi::Error::from_reason(
                "clipboard_locked: could not open clipboard after 3 retries",
            ))
        }
    }
}
