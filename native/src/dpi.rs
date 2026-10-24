//! One coordinate space on Windows (7.7.0, K6).
//!
//! The server ran DPI-unaware: Windows virtualised window rectangles and mouse coordinates to 96 DPI while UI
//! Automation reported physical pixels, so at any scaling above 100 % an element's centre from `get_ui_tree` was not
//! where a click landed, and a second monitor with a different scale was wrong twice. Per-monitor DPI awareness (v2)
//! makes every API speak physical pixels of the virtual desktop: input, window bounds, displays, captures and UI
//! Automation agree. `COMPUTER_USE_WINDOWS_DPI_AWARENESS=unaware` restores the old behaviour.
//!
//! On macOS and Linux this module does nothing: their coordinates are points (macOS) or pixels (X11) already.

/// Make this process per-monitor DPI aware (v2) before the first coordinate is read. Idempotent and cheap after the
/// first call; every native entry point that reads or writes screen coordinates calls it.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn ensure() {
    #[cfg(target_os = "windows")]
    win::ensure();
}

/// Whether coordinates are physical pixels (per-monitor aware) rather than virtualised to 96 DPI.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
pub fn per_monitor_aware() -> bool {
    #[cfg(target_os = "windows")]
    {
        win::per_monitor_aware()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[cfg(target_os = "windows")]
mod win {
    use std::sync::OnceLock;
    use windows::Win32::UI::HiDpi::{
        AreDpiAwarenessContextsEqual, GetThreadDpiAwarenessContext, SetProcessDpiAwarenessContext,
        SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
    };

    static AWARE: OnceLock<bool> = OnceLock::new();

    fn opted_out() -> bool {
        std::env::var("COMPUTER_USE_WINDOWS_DPI_AWARENESS")
            .map(|value| value.trim().eq_ignore_ascii_case("unaware"))
            .unwrap_or(false)
    }

    fn thread_is_per_monitor_v2() -> bool {
        unsafe {
            AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)
                .as_bool()
        }
    }

    pub fn ensure() {
        let aware = *AWARE.get_or_init(|| {
            if opted_out() {
                return false;
            }
            unsafe {
                // Process-wide when nothing has fixed it yet; a host (Electron) that already declared awareness makes
                // this fail, in which case the calling thread (the one every N-API call runs on) is switched instead.
                if SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2).is_ok() {
                    return true;
                }
                if thread_is_per_monitor_v2() {
                    return true;
                }
                !SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2).0.is_null()
            }
        });
        // A thread switched above stays switched; other threads (workers) switch on their first call.
        if aware && !thread_is_per_monitor_v2() {
            unsafe {
                let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
            }
        }
    }

    pub fn per_monitor_aware() -> bool {
        ensure();
        thread_is_per_monitor_v2()
    }
}
