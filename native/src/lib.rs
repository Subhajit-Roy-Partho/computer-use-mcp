mod accessibility;
#[cfg(target_os = "windows")]
mod capture_win;
mod activity;
mod apps;
#[cfg(any(target_os = "windows", target_os = "linux"))]
mod clipboard;
mod display;
mod dpi;
mod keyboard;
mod keychain;
#[cfg(target_os = "linux")]
mod linux_tools;
mod mouse;
mod overlay;
mod permissions;
mod screenshot;
mod session_state;
mod spaces;
mod windows;
#[cfg(target_os = "windows")]
mod win_util;
