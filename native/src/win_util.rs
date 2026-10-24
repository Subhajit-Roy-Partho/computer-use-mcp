//! Window facts shared by the window list, `prepare_display` and capture on Windows (7.7.0).

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::UI::WindowsAndMessaging::*;

/// The window's visible frame: the extended frame bounds from DWM, which exclude the invisible resize borders (about
/// 7 px on each side on Windows 10 and 11) that `GetWindowRect` includes. A capture shows exactly this rectangle, so
/// reporting it keeps image-to-screen mapping exact. Falls back to `GetWindowRect`.
pub fn visible_bounds(hwnd: HWND) -> RECT {
    crate::dpi::ensure();
    let mut rect = RECT::default();
    unsafe {
        if DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut RECT as *mut _,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok()
            && rect.right > rect.left
            && rect.bottom > rect.top
        {
            return rect;
        }
        let _ = GetWindowRect(hwnd, &mut rect);
    }
    rect
}

/// Cloaked windows are drawn by nobody: a suspended Store app's frame, a window on another virtual desktop, the input
/// host while hidden. They report visible but are not on screen.
pub fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    unsafe {
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        )
        .is_ok()
            && cloaked != 0
    }
}

pub fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..len.max(0) as usize])
}

/// Processes that are part of the shell or of text input, never an app the agent works in. Minimising their windows
/// broke the touch keyboard, the emoji panel and IME input (claude-code #102334, #97945).
const SHELL_PROCESSES: &[&str] = &[
    "explorer.exe",
    "textinputhost.exe",
    "shellexperiencehost.exe",
    "startmenuexperiencehost.exe",
    "searchhost.exe",
    "searchapp.exe",
    "lockapp.exe",
    "ctfmon.exe",
    "dwm.exe",
    "widgets.exe",
    "shellhost.exe",
    "systemsettingsbroker.exe",
];

/// Window classes of the shell itself (taskbars, desktop), whatever process owns them.
const SHELL_CLASSES: &[&str] = &[
    "Shell_TrayWnd",
    "Shell_SecondaryTrayWnd",
    "Progman",
    "WorkerW",
    "NotifyIconOverflowWindow",
    "Windows.UI.Core.CoreWindow",
    "ApplicationManager_ImmersiveShellWindow",
];

pub fn is_shell_process(process_name: &str) -> bool {
    let lower = process_name.to_ascii_lowercase();
    SHELL_PROCESSES.contains(&lower.as_str())
}

/// A top-level window a person would call an app window: visible, not cloaked, not a tool window, not owned by
/// another window (dialogs and palettes follow their owner), not the shell's. `prepare_display` only ever minimises
/// these (7.7.0, W4: before, it minimised every visible window of every other process, cloaked and system ones too).
pub fn is_app_window(hwnd: HWND, process_name: &str) -> bool {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() || is_cloaked(hwnd) {
            return false;
        }
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if ex_style & WS_EX_TOOLWINDOW.0 != 0 || ex_style & WS_EX_NOACTIVATE.0 != 0 {
            return false;
        }
        if GetWindow(hwnd, GW_OWNER).map(|owner| !owner.0.is_null()).unwrap_or(false) {
            return false;
        }
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if style & WS_MINIMIZEBOX.0 == 0 && style & WS_CAPTION.0 != WS_CAPTION.0 {
            // No caption and nothing to minimise: an overlay, a splash, a popup.
            return false;
        }
    }
    !is_shell_process(process_name) && !SHELL_CLASSES.contains(&class_name(hwnd).as_str())
}
