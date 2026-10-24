//! External tools on Linux (7.7.0, L1 and L2).
//!
//! Every shell-out goes through here so that a child never inherits this process's stdout, which is the MCP channel
//! (a tool that prints would corrupt JSON-RPC), and so that a missing tool is a named error with the package to install
//! rather than an empty result or a silent success.

use std::io::ErrorKind;
use std::process::{Command, Output, Stdio};

/// What to install for a tool, for the error message.
pub fn install_hint(tool: &str) -> &'static str {
    match tool {
        "xdotool" => "install xdotool (apt install xdotool / dnf install xdotool)",
        "ydotool" => "install ydotool and start its daemon (ydotoold) with access to /dev/uinput",
        "wmctrl" => "install wmctrl (apt install wmctrl / dnf install wmctrl)",
        "xclip" => "install xclip (apt install xclip), or wl-clipboard on Wayland",
        "wl-copy" | "wl-paste" => "install wl-clipboard (apt install wl-clipboard)",
        "scrot" => "install scrot (apt install scrot), or use an X11 session",
        "grim" => "install grim (wlroots compositors such as sway)",
        "gnome-screenshot" => "install gnome-screenshot",
        _ => "install it with your package manager",
    }
}

/// Run `tool args…` with stdin closed and output captured. A tool that is not installed is an error naming it.
pub fn output(tool: &str, args: &[&str]) -> napi::Result<Output> {
    Command::new(tool)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| {
            if error.kind() == ErrorKind::NotFound {
                napi::Error::from_reason(format!("{tool} is not installed: {}", install_hint(tool)))
            } else {
                napi::Error::from_reason(format!("{tool} could not start: {error}"))
            }
        })
}

/// Run a tool that must succeed; a non-zero exit is an error carrying its stderr.
pub fn run(tool: &str, args: &[&str]) -> napi::Result<Output> {
    let result = output(tool, args)?;
    if result.status.success() {
        Ok(result)
    } else {
        let stderr = String::from_utf8_lossy(&result.stderr);
        let detail = stderr.trim();
        Err(napi::Error::from_reason(format!(
            "{tool} failed ({}){}",
            result.status,
            if detail.is_empty() { String::new() } else { format!(": {}", detail.chars().take(300).collect::<String>()) }
        )))
    }
}

/// Is the tool on PATH (it can be started)?
pub fn available(tool: &str) -> bool {
    Command::new(tool)
        .arg("--help")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::{install_hint, output, run};

    #[test]
    fn a_missing_tool_is_named_with_what_to_install() {
        let error = output("computer-use-mcp-no-such-tool", &[]).unwrap_err();
        assert!(error.reason.contains("computer-use-mcp-no-such-tool is not installed"));
        assert!(install_hint("xdotool").contains("xdotool"));
    }

    #[test]
    fn a_failing_tool_is_an_error_and_its_output_never_reaches_our_stdout() {
        let error = run("sh", &["-c", "echo not-on-our-stdout; echo broke >&2; exit 3"]).unwrap_err();
        assert!(error.reason.contains("broke"), "{}", error.reason);
        let ok = run("sh", &["-c", "echo captured"]).unwrap();
        assert_eq!(String::from_utf8_lossy(&ok.stdout).trim(), "captured");
    }
}
