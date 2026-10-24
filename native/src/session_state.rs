//! Is the desktop usable right now? (7.7.0, K5)
//!
//! A locked screen accepts no input and shows nothing worth capturing, yet every call used to proceed: clicks went to
//! the lock screen, captures came back black or failed with a raw API error. The session reports its state so the
//! server can refuse with `screen_locked` (or, on Windows, `session_disconnected` for a disconnected Remote Desktop
//! session and `secure_desktop` while a UAC prompt or the sign-in screen is up), and it can keep the display awake
//! while an agent works, so the screen does not lock under it in the first place.

use napi_derive::napi;

#[napi(object)]
pub struct SessionStateReport {
    /// `Some(true)` when the screen is locked; `None` when this platform or session cannot tell.
    pub locked: Option<bool>,
    /// Windows: the session's Remote Desktop connection is disconnected (input and capture go nowhere).
    pub disconnected: bool,
    /// Windows: the secure desktop (UAC prompt, sign-in, Ctrl+Alt+Del) has the input.
    pub secure_desktop: bool,
    /// macOS: this user's session is not the one on the console (fast user switching).
    pub off_console: bool,
    pub backend: String,
    pub detail: Option<String>,
}

#[napi]
pub fn get_session_state() -> SessionStateReport {
    platform::state()
}

/// Prefix a capture or input failure with what the session says, when that explains it.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn explain_capture_failure(detail: &str) -> String {
    let state = platform::state();
    if state.disconnected {
        format!("session_disconnected: the Remote Desktop session is disconnected, so nothing can be captured or driven until someone reconnects ({detail})")
    } else if state.locked == Some(true) {
        format!("screen_locked: the screen is locked, so nothing can be captured or driven until the person unlocks it ({detail})")
    } else if state.secure_desktop {
        format!("secure_desktop: a UAC prompt or the sign-in screen has the input, and Windows keeps other processes out of it ({detail})")
    } else {
        detail.to_string()
    }
}

/// Keep the display awake while an agent works (macOS: an IOKit `PreventUserIdleDisplaySleep` assertion; Windows:
/// `SetThreadExecutionState`). Idempotent; the server releases it after a quiet period. Returns whether it is held.
#[napi]
pub fn hold_display_awake(reason: String) -> bool {
    platform::hold_display_awake(&reason)
}

#[napi]
pub fn release_display_awake() {
    platform::release_display_awake();
}

#[cfg(target_os = "macos")]
mod platform {
    use super::SessionStateReport;
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};
    use std::sync::Mutex;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSessionCopyCurrentDictionary() -> CFDictionaryRef;
    }

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: CFStringRef,
            level: u32,
            name: CFStringRef,
            id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(id: u32) -> i32;
    }

    const K_IOPM_ASSERTION_LEVEL_ON: u32 = 255;
    static ASSERTION: Mutex<Option<u32>> = Mutex::new(None);

    fn flag(dict: &CFDictionary<CFString, CFType>, key: &'static str) -> Option<bool> {
        let value = dict.find(CFString::from_static_string(key))?;
        value.downcast::<CFBoolean>().map(bool::from)
    }

    pub fn state() -> SessionStateReport {
        let raw = unsafe { CGSessionCopyCurrentDictionary() };
        if raw.is_null() {
            // No window-server session at all (a daemon, SSH without the console).
            return SessionStateReport {
                locked: None,
                disconnected: false,
                secure_desktop: false,
                off_console: true,
                backend: "cg_session".into(),
                detail: Some("no window-server session".into()),
            };
        }
        let dict: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_create_rule(raw) };
        // The key is present (and true) only while the screen is locked.
        let locked = flag(&dict, "CGSSessionScreenIsLocked").unwrap_or(false);
        let on_console = flag(&dict, "kCGSSessionOnConsoleKey").unwrap_or(true);
        SessionStateReport {
            locked: Some(locked),
            disconnected: false,
            secure_desktop: false,
            off_console: !on_console,
            backend: "cg_session".into(),
            detail: None,
        }
    }

    pub fn hold_display_awake(reason: &str) -> bool {
        let mut held = ASSERTION.lock().unwrap_or_else(|p| p.into_inner());
        if held.is_some() {
            return true;
        }
        let kind = CFString::from_static_string("PreventUserIdleDisplaySleep");
        let name = CFString::new(reason);
        let mut id: u32 = 0;
        let status = unsafe {
            IOPMAssertionCreateWithName(kind.as_concrete_TypeRef(), K_IOPM_ASSERTION_LEVEL_ON, name.as_concrete_TypeRef(), &mut id)
        };
        if status == 0 {
            *held = Some(id);
            true
        } else {
            false
        }
    }

    pub fn release_display_awake() {
        if let Some(id) = ASSERTION.lock().unwrap_or_else(|p| p.into_inner()).take() {
            unsafe {
                IOPMAssertionRelease(id);
            }
        }
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::SessionStateReport;
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED};
    use windows::Win32::System::RemoteDesktop::*;
    use windows::Win32::System::StationsAndDesktops::{
        CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, DESKTOP_ACCESS_FLAGS, DESKTOP_CONTROL_FLAGS, UOI_NAME,
    };

    static AWAKE: AtomicBool = AtomicBool::new(false);
    const WTS_SESSIONSTATE_LOCK: u32 = 0;
    const WTS_SESSIONSTATE_UNLOCK: u32 = 1;

    fn session_flags() -> Option<(Option<bool>, bool)> {
        unsafe {
            let mut buffer = windows::core::PWSTR::null();
            let mut bytes: u32 = 0;
            WTSQuerySessionInformationW(
                WTS_CURRENT_SERVER_HANDLE,
                WTS_CURRENT_SESSION,
                WTSSessionInfoEx,
                &mut buffer,
                &mut bytes,
            )
            .ok()?;
            let info = &*(buffer.0 as *const WTSINFOEXW);
            let level1 = &info.Data.WTSInfoExLevel1;
            let locked = match level1.SessionFlags as u32 {
                WTS_SESSIONSTATE_LOCK => Some(true),
                WTS_SESSIONSTATE_UNLOCK => Some(false),
                _ => None,
            };
            let disconnected = level1.SessionState == WTSDisconnected;
            WTSFreeMemory(buffer.0 as *mut _);
            Some((locked, disconnected))
        }
    }

    /// The input desktop's name: "Default" normally, "Winlogon" for the sign-in, lock and UAC secure desktop. Opening
    /// it fails outright while the secure desktop is up for a normal process.
    fn input_desktop_is_secure() -> bool {
        unsafe {
            match OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_ACCESS_FLAGS(0x0001)) {
                Err(_) => true,
                Ok(desktop) => {
                    let mut name = [0u16; 64];
                    let mut needed: u32 = 0;
                    let ok = GetUserObjectInformationW(
                        windows::Win32::Foundation::HANDLE(desktop.0),
                        UOI_NAME,
                        Some(name.as_mut_ptr() as *mut _),
                        (name.len() * 2) as u32,
                        Some(&mut needed),
                    )
                    .is_ok();
                    let _ = CloseDesktop(desktop);
                    let text = String::from_utf16_lossy(&name).trim_end_matches('\0').to_string();
                    ok && !text.eq_ignore_ascii_case("Default")
                }
            }
        }
    }

    pub fn state() -> SessionStateReport {
        let (locked, disconnected) = session_flags().unwrap_or((None, false));
        SessionStateReport {
            locked,
            disconnected,
            secure_desktop: input_desktop_is_secure(),
            off_console: false,
            backend: "wts".into(),
            detail: None,
        }
    }

    pub fn hold_display_awake(_reason: &str) -> bool {
        // Thread-bound: every N-API call runs on the same thread, which is the one that releases it.
        let previous = unsafe { SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED) };
        let held = previous.0 != 0;
        AWAKE.store(held, Ordering::Release);
        held
    }

    pub fn release_display_awake() {
        if AWAKE.swap(false, Ordering::AcqRel) {
            unsafe {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::SessionStateReport;

    pub fn state() -> SessionStateReport {
        // logind knows whether this session is locked (LockedHint), on X11 and Wayland alike.
        let session = std::env::var("XDG_SESSION_ID").unwrap_or_else(|_| "self".into());
        match crate::linux_tools::output("loginctl", &["show-session", &session, "-p", "LockedHint", "--value"]) {
            Ok(out) if out.status.success() => {
                let value = String::from_utf8_lossy(&out.stdout).trim().to_ascii_lowercase();
                SessionStateReport {
                    locked: match value.as_str() {
                        "yes" => Some(true),
                        "no" => Some(false),
                        _ => None,
                    },
                    disconnected: false,
                    secure_desktop: false,
                    off_console: false,
                    backend: "logind".into(),
                    detail: None,
                }
            }
            Ok(out) => SessionStateReport {
                locked: None,
                disconnected: false,
                secure_desktop: false,
                off_console: false,
                backend: "logind".into(),
                detail: Some(String::from_utf8_lossy(&out.stderr).trim().chars().take(200).collect()),
            },
            Err(error) => SessionStateReport {
                locked: None,
                disconnected: false,
                secure_desktop: false,
                off_console: false,
                backend: "none".into(),
                detail: Some(error.reason),
            },
        }
    }

    pub fn hold_display_awake(_reason: &str) -> bool {
        false
    }

    pub fn release_display_awake() {}
}
