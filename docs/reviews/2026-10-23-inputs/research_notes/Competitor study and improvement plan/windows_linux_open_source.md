# Windows, Linux and open-source desktop-control agents and MCP servers: changes 2026-10-11 to 2026-10-23, and how they handle capture and input

Method: GitHub releases, PRs, issues and source were read through the GitHub API on 2026-10-23, plus Microsoft Learn, freedesktop, KDE and Windows blog pages. Dates are UTC from GitHub. Facts about computer-use-mcp itself come from a grep of this repository (`native/src`, `src`, `libexec`) on 2026-10-23 and are cited by file path. Nothing here was run or measured by me. Throughput and latency figures are the PR authors' own measurements.

## Q1. New releases and changes since 2026-10-11 (Windows-MCP, cua, UFO, UI-TARS-desktop, Agent S, Bytebot, Open Interpreter, Linux MCP servers, Microsoft's agentic platform)

### Takeaway
The two projects that matter most moved fast in this window. Windows-MCP published no release, but main gained about 20 merged PRs. Most of them harden the 0.8.8 control gate (stale-key recovery, a movement threshold for takeover, gate policies), and one bounds UI Automation calls with IUIAutomation2 timeouts. cua-driver-rs shipped 0.35.2, 0.35.4, 0.36.0, 0.37.0 and 0.38.0, with a cluster of Windows input and capture fixes and Linux Wayland, XWayland and GNOME fixes. On Linux, agent-sh/computer-use-linux (Rust, 733 stars) shipped seven releases, and KDE Plasma 6.8 (2026-10-14) retired X11 sessions. Microsoft's main item was MXC (Microsoft Execution Containers), which went GA on 2026-10-07 (v1.0.1 on 2026-10-17). UFO, UI-TARS-desktop, Agent S, Bytebot and Open Interpreter shipped nothing relevant to Windows or Linux capture and input.

### Cited Findings

**Windows-MCP (CursorTouch). No release since v0.8.8. Everything below is on main only.**
- The latest GitHub release is still v0.8.8, published 2026-10-10T01:33:58Z. Before that came v0.8.7 (2026-09-30) and v0.8.6 (2026-09-26) — [releases](https://github.com/CursorTouch/Windows-MCP/releases). On 2026-10-18 issue #475 asked for a new PyPI release because "0.8.8 lags main (control-disable options missing…)" — [#475](https://github.com/CursorTouch/Windows-MCP/issues/475)
- **Baseline confirmed.** v0.8.8 shipped the control gate, `USER_CONTROL`, `ControlStatus` and an indicator. Several issues filed in this window are against "v0.8.8: control gate (USER_CONTROL)" — [#457](https://github.com/CursorTouch/Windows-MCP/issues/457), [#465](https://github.com/CursorTouch/Windows-MCP/issues/465)
- **#458 (merged 2026-10-12): the desktop control gate can be turned off, and its idle timeout set.** Settings are TOML `control.enabled` and `control.idle_timeout_seconds`, env `WINDOWS_MCP_CONTROL` and `WINDOWS_MCP_CONTROL_IDLE_TIMEOUT`, or CLI `--control/--no-control --control-idle-timeout`. Precedence is CLI > env > TOML. The default stays on with a 10 s timeout. When the gate is off, calls stay serialized and injected-input cleanup is kept — [PR #458](https://github.com/CursorTouch/Windows-MCP/pull/458)
- **#460 (merged 2026-10-14): recovery from stale input.** After a missed physical key or button release, the server reconciles its held-key bookkeeping with `GetAsyncKeyState`. It needs "five consecutive all-released samples, at least 100 ms apart" before clearing stale holds. Cleanup runs on the existing worker, not the hook message pump, because "lock contention during takeover … delayed injection and caused missed hook callbacks". The trigger was Alt+Tab with Tab released before Alt (AltTaber, elevated hook utilities). The fix fixes #456 — [PR #460](https://github.com/CursorTouch/Windows-MCP/pull/460)
- **#466 (merged 2026-10-16): gate policies and deliberate mouse takeover.**
  - Three policies, set at startup. `relaxed` (the default) gates only direct desktop operations. `balanced` also gates potentially disruptive ones. `strict` gates every tool except ControlStatus. Under relaxed, PowerShell, FileSystem, Registry, Process and Clipboard calls no longer wait for the desktop to go idle.
  - Takeover now needs "cumulative physical relative Raw Input movement of 500 units". A gap of at least 0.5 s between nonzero movements resets the count. "Injected input and cursor coordinates do not count."
  - Input checkpoints are revoked when a gated request ends, "preventing subsequent input from stale workers after takeover or cancellation".
  - Measured: 128 small movements totalling 237 units did not interrupt the agent. Deliberate movement triggered takeover at 511 and 501 units.
  - [PR #466](https://github.com/CursorTouch/Windows-MCP/pull/466)
- **#476 (merged 2026-10-18): the server skips its own windows when collecting control handles.**
  - The overlay creates seven `WindowsMCPControl_*` top-level windows, and the tree walk spent about 1 s on each. The fix skips any hwnd where `GetWindowThreadProcessId(hwnd)[1] == os.getpid()`.
  - Snapshot went from 15.2 s to 0.5–0.6 s, and Click-with-state from 15.5 s to 1.4 s.
  - The PR notes that `WINDOWS_MCP_EXCLUDE_PROCESSES=python.exe` only filters the tree, not `get_windows`, and also hides the user's own Python apps.
  - [PR #476](https://github.com/CursorTouch/Windows-MCP/pull/476)
- **#481 (merged 2026-10-20): Japanese IME mode keys no longer latch the gate.** `VK_DBE_SBCSCHAR` and `VK_DBE_DBCSCHAR` (0xF3/0xF4) at scan code 0x29 now count as activity, not as a held key. Their async "high bit can remain set", which had left the gate stuck in `user` — [PR #481](https://github.com/CursorTouch/Windows-MCP/pull/481)
- **#485 (merged 2026-10-22): SendKeys releases keys when a chord is interrupted.** Braced key names are validated before any input is injected. Pending virtual-key releases are tracked and sent in reverse order if sending raises, including on `KeyboardInterrupt`. Before this, `{Ctrl}{comma}` pressed Ctrl and then failed — [PR #485](https://github.com/CursorTouch/Windows-MCP/pull/485)
- **#487 (merged 2026-10-22): natural punctuation names in Shortcut, and MultiSelect validates points first.** Names such as `comma`, `plus`, `minus` and `backslash` now work. `plus` maps to `VK_OEM_PLUS`, because sending the `+` character "goes out as a Unicode packet after Ctrl is released". MultiSelect checks every point before it presses Ctrl — [PR #487](https://github.com/CursorTouch/Windows-MCP/pull/487)
- **#497 (merged 2026-10-23): UI Automation calls are bounded with IUIAutomation2 timeouts.**
  - The shared client is now created from `CUIAutomation8` as `IUIAutomation2`. The old v1 `CUIAutomation` "only implements IUIAutomation" and has no timeout, and QI for IUIAutomation2 on it returns `E_NOINTERFACE`.
  - Defaults are `ConnectionTimeout` 2000 ms and `TransactionTimeout` 5000 ms, overridable with `WINDOWS_MCP_UIA_CONNECTION_TIMEOUT_MS` and `WINDOWS_MCP_UIA_TRANSACTION_TIMEOUT_MS`. The PR notes that CUIAutomation8's own transaction default is 20 s.
  - A timeout surfaces as `0x800705B4` (ERROR_TIMEOUT), which is mapped to `UIATimeoutError`. A window that times out goes into `failed_handles` after one attempt, with no retries.
  - A timeout from `BuildUpdatedCache` is re-raised instead of falling back to `GetChildren()` on the same hung provider.
  - Snapshot with a hung window on screen went from 127.5 s to 6.6 s.
  - The PR also notes that cancelling the MCP request "can't interrupt the COM call on the single worker".
  - [PR #497](https://github.com/CursorTouch/Windows-MCP/pull/497)
- **Other merges, 2026-10-13 to 2026-10-23:**
  - PowerShell executable resolved against the child's PATH ([#459](https://github.com/CursorTouch/Windows-MCP/pull/459))
  - Strict boolean parsing ([#461](https://github.com/CursorTouch/Windows-MCP/pull/461))
  - Scrape DNS and charset fixes ([#473](https://github.com/CursorTouch/Windows-MCP/pull/473), [#477](https://github.com/CursorTouch/Windows-MCP/pull/477))
  - Install no longer leaves a console window open ([#486](https://github.com/CursorTouch/Windows-MCP/pull/486))
  - Filesystem: reject overlapping copy and move paths, delete symlinks and junctions without touching their targets, exclude hidden directories from recursive listings ([#489](https://github.com/CursorTouch/Windows-MCP/pull/489), [#490](https://github.com/CursorTouch/Windows-MCP/pull/490), [#491](https://github.com/CursorTouch/Windows-MCP/pull/491))
  - Registry key paths passed literally ([#492](https://github.com/CursorTouch/Windows-MCP/pull/492))
- **#309 "Feat/uac policy" was merged on 2026-10-22 into the feature branch `feat/uac-policy`, not into main.**
  - An opt-in service mode sets `PromptOnSecureDesktop=0` and `ConsentPromptBehaviorAdmin=4`, so `consent.exe` renders on the Default desktop instead of the Secure (Winlogon) desktop.
  - A LocalSystem service (`WindowsMCPHost`) spawns a user-session worker with a UIAccess token. The worker finds `consent.exe` through EnumWindows and ElementFromHandle, synthesizes the Yes/No coordinates from the dialog bounds, and clicks with `SendInput`. The UIAccess token exempts that click from UIPI.
  - It adds a `WaitForUACPrompt` tool and was verified on Windows 11 25H2 (26200).
  - [PR #309](https://github.com/CursorTouch/Windows-MCP/pull/309)
- **Still open:** fast-capture metadata and coordinate mapping in Snapshot ([#471](https://github.com/CursorTouch/Windows-MCP/pull/471)), an opt-in keep-awake mode ([#472](https://github.com/CursorTouch/Windows-MCP/pull/472)), and keeping both PowerShell output streams ([#470](https://github.com/CursorTouch/Windows-MCP/pull/470))
- **Issues filed in the window that show how the gate fails:**
  - **#465:** an indicator heartbeat stall over 1 s "fails open" and recovers into `user`, so `USER_CONTROL` is reported with no physical input. It is triggered by concurrent tool calls. An unacknowledged indicator state change within 3 s leaves the server `CONTROL_UNAVAILABLE` until restart — [#465](https://github.com/CursorTouch/Windows-MCP/issues/465)
  - **#478:** when the indicator fails to render, for example because Smart App Control blocks the unsigned `PIL/_imagingft.pyd`, the controller becomes `unavailable` permanently while `ControlStatus` still says `ready` — [#478](https://github.com/CursorTouch/Windows-MCP/issues/478)
  - **#483:** Shortcut, MultiSelect and Scroll press modifiers without a guaranteed release — [#483](https://github.com/CursorTouch/Windows-MCP/issues/483)
  - **#498 (2026-10-23):** some wireless receivers (ASUS ROG OMNI RECEIVER) stream zero-delta `WM_MOUSEMOVE`. That refreshes the last-physical-event time forever, so the gate never leaves `user`, even with a 0.5 s timeout — [#498](https://github.com/CursorTouch/Windows-MCP/issues/498)
  - **Others:** under MSIX Claude Desktop, PowerShell writes to AppData are silently redirected ([#488](https://github.com/CursorTouch/Windows-MCP/issues/488)). Electron and Chromium per-character `word` leaves dominate the Snapshot output ([#495](https://github.com/CursorTouch/Windows-MCP/issues/495)). A request to write screenshots to a file so pixels and coordinates match ([#496](https://github.com/CursorTouch/Windows-MCP/issues/496)).

**cua (trycua/cua). cua-driver-rs releases in the window. GitHub labels them "Pre-release" only to keep the monorepo's Latest pointer stable.**
- **v0.34.1 (2026-10-09, baseline confirmed):** "capture GNOME windows from their own actor (WinRects v10)", `display_only` on get_window_state, "wait for EIS to acknowledge libei input before replying", and `CUA_DRIVER_RS_ENABLE_WAYLAND` passed through to embedded hosts — [release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.34.1)
- **v0.35.2 (2026-10-13):** names the missing AT-SPI bus in the X11 background-keyboard refusal (#5070), and tolerates "a transient UIA read and a twice-reported consent prompt on Windows" (#5082) — [release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.35.2)
- **v0.35.4 (2026-10-14):**
  - Wakes Chromium AT-SPI content before the first tree traversal. It calls `GetAttributes` on the application root once per PID; already-running Chromium and Electron apps otherwise "expose only application and window frames" ([#5074](https://github.com/trycua/cua/pull/5074))
  - No console window for the embedded daemon on Windows (#5136)
  - `type_text` fails when a character cannot be typed (#5139)
  - Each character gets its own spare keycode (#5158)
  - [release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.35.4)
- **v0.36.0 (2026-10-16):** mostly macOS background work. Linux and Windows items:
  - Long Linux X11 text is typed in batches bounded by the free spare keycodes, and each batch restores its remaps ([#5168](https://github.com/trycua/cua/pull/5168))
  - Worker processes no longer launch Orca on GNOME (#5179)
  - Linux and Windows report their real permission status instead of "not granted" (#5237)
  - The driver now "say[s] why a Windows desktop can't be captured (locked, RDP disconnected)" ([#5266](https://github.com/trycua/cua/pull/5266), details in Q2)
  - [release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.36.0)
- **v0.37.0 (2026-10-20):**
  - Lists untitled X11 windows that the window manager manages ([#5341](https://github.com/trycua/cua/pull/5341))
  - Recovery hints on refusals and unverifiable results (#5493)
  - A skill pack plus a `get_guide` tool (#5491)
  - Reports a locked screen and keeps the display awake while an agent works ([#5483](https://github.com/trycua/cua/pull/5483), macOS: an IOKit `PreventUserIdleDisplaySleep` assertion released 10 min after the last call)
  - [release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.37.0)
- **v0.38.0 (2026-10-21). "1 features and … 25 fixes".**
  - Windows:
    - Suspends the target GUI thread while posting a click ([#5584](https://github.com/trycua/cua/pull/5584))
    - Never sends a foreground drag to the window covering the target ([#5616](https://github.com/trycua/cua/pull/5616))
    - Reports UIA tree completeness ([#5582](https://github.com/trycua/cua/pull/5582))
    - `list_windows` omits the driver's own overlay windows ([#5566](https://github.com/trycua/cua/pull/5566))
    - Scales foreground scroll targets from the screenshot context ([#5567](https://github.com/trycua/cua/pull/5567))
    - Delivers window-only foreground hotkeys through the HID activation guard (#5522)
    - Restricts launch candidates to the receipt process family (#5561)
    - Handles Add-Type failure on non-ASCII locales (#5581)
  - Linux:
    - Accepts the GNOME helper only from the session's Shell ([#5496](https://github.com/trycua/cua/pull/5496))
    - Refuses to start the GNOME 50+ helper ([#5565](https://github.com/trycua/cua/pull/5565))
    - Discovers native Wayland windows in desktop snapshots ([#5368](https://github.com/trycua/cua/pull/5368))
    - Recovers rootless XWayland browser identities ([#5597](https://github.com/trycua/cua/pull/5597))
    - Keeps GNOME element actions inside the requested window (#5585)
    - Undoes the GTK4 CSD inset before at-point ownership checks ([#5610](https://github.com/trycua/cua/pull/5610))
  - Also: "publish cua-sdk and the proto contract so you can build your own harness" (#5532)
  - [release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0)
- **Other cua products released in the window, not inspected:** cua-sdk 0.4.2 through 0.7.0 (0.7.0 on 2026-10-21), Cua Spaces 0.8.0 through 0.13.1 (0.13.1 on 2026-10-22), cua-spacesd 0.6.0 and 0.7.0, agent-v0.9.1, sandbox-v0.9.1 — [releases](https://github.com/trycua/cua/releases)

**Linux-specific MCP servers**
- **agent-sh/computer-use-linux** is Rust, created 2026-05-13, with 733 stars on 2026-10-23. It was extracted from `codex-desktop-linux` and is the upstream for that app's native Computer Use feature — [repo](https://github.com/agent-sh/computer-use-linux), [README](https://github.com/agent-sh/computer-use-linux#readme). Releases in the window:
  - **v0.7.16 (2026-10-12):** KWin backend uses stable atomics, so it builds on Rust 1.93.1 — [v0.7.16](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.16)
  - **v0.7.17 (2026-10-15):** stabilizes Hyprland `wtype` input — [v0.7.17](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.17)
  - **v0.7.18 (2026-10-17):** "post-action screenshot and accessibility tree capture". Every mutating tool takes `screenshot_after` and `include_tree` — [v0.7.18](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.18)
  - **v0.7.19 (2026-10-17):** fixes startup for hosts that send `server/discover` before `initialize`, on rmcp 3.5.1 — [v0.7.19](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.19)
  - **v0.7.20 (2026-10-18):** warns that xdotool and XTEST can silently substitute symbols under non-US or changing XKB layouts — [v0.7.20](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.20)
  - **v0.7.21 (2026-10-20):** reads WebKitGTK content through AT-SPI socket children. Detects an XKB layout replacement during typing (for example `br -> us -> br`) and returns an error after dispatch "without replaying the text" — [v0.7.21](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.21)
  - **v0.7.22 (2026-10-20):** detects temporary X11 keyboard grabs and focus changes during text dispatch. "A keyboard grab can drop a contiguous block of characters while the keymap and GetInputFocus stay unchanged" — [v0.7.22](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.22)
- **agent-sh/agent-workspace-linux** is a sibling project: "a hidden, agent-owned desktop and browser over MCP". It has 195 stars, and its last release is v0.3.3 (2026-09-19), so nothing shipped in the window — [repo](https://github.com/agent-sh/agent-workspace-linux)
- **mirsella/computer-use-mcp** is Rust, 2 stars, a "Wayland-native computer-use MCP server using AT-SPI, XDG portals, PipeWire, and EIS" that targets only KDE Plasma Wayland. Releases: v0.8.0 and v0.8.1 (2026-10-13), v1.0.0 and v2.0.0 (2026-10-16; v2 is "publish … under its harness-neutral npm name"). It has a private-session runner, `scripts/run-isolated-session.sh`, that starts a private D-Bus, KWin, PipeWire, WirePlumber, AT-SPI and portal stack, and installs private KDE RemoteDesktop authorization. Its README warns that "AT-SPI reads and semantic actions can expose private text or cause side effects without a portal prompt" — [repo](https://github.com/mirsella/computer-use-mcp)
- A DEV Community roundup from about early October 2026 describes computer-use-linux as the one that "actually handles Wayland". This is a secondary source — [DEV](https://dev.to/saptadev27/let-ai-control-your-desktop-the-best-computer-use-mcp-servers-in-2026-49k4)

**Linux desktop platform events**
- **KDE Plasma 6.8 was released on 2026-10-14.**
  - "Starting X11 sessions in Plasma is being retired". Apps that still need X11 run through XWayland.
  - The remote-desktop server gains an "Exclusive mode" (the server screen locks and the client gets a matching virtual screen) and bi-directional clipboard sync.
  - The screen-sharing portal dialog now lets the user set the virtual screen's resolution.
  - A new `kscreenctl` CLI.
  - [KDE announcement](https://kde.org/announcements/plasma/6/6.8.0/)
  - An August 2026 Phoronix piece listed "enabling libei support for emulated input" among the 6.8 remote-desktop work. This comes from a search snippet and was not verified against release notes — [Phoronix](https://phoronix.com/news/Plasma-68-Better-Remote-Desktop)
- **Ubuntu 26.10 was released on 2026-10-15** with GNOME 51 and Linux 7.3 — [UbuntuHandbook](https://ubuntuhandbook.org/index.php/2026/10/ubuntu-26-10-released-with-kernel-7-3-gnome-51-amd64v3-image/)

**Microsoft's agentic Windows platform**
- **MXC (Microsoft Execution Containers).** v1.0.0 was published 2026-10-07 and v1.0.1 on 2026-10-17 (crates.io `mxc-sdk`, npm `@microsoft/mxc-sdk`, NuGet `Microsoft.Mxc.Sdk`); the stable schema stays 1.0.0 — [releases](https://github.com/microsoft/mxc/releases), [v1.0.1](https://github.com/microsoft/mxc/releases/tag/v1.0.1)
  - Backends include ProcessContainer, Bubblewrap, Seatbelt, MicroVM (Nanvix), Hyperlight, IsolationSession and WSLC. The README lists a "UI policy: Clipboard, display, and GUI access controls" — [README](https://github.com/microsoft/mxc)
  - Commits in the window include "[IsolationSession] Keep async exec exit codes under Windows PowerShell 5.1" (2026-10-22), "Remove Tier2 and Tier3 ProcessContainer fallbacks" (2026-10-23) and a Bubblewrap always-on seccomp filter (2026-10-22) — [commits](https://github.com/microsoft/mxc/commits/main)
- The MXC launch post (2026-10-07) splits MXC into two kinds of container — [Windows Developer Blog](https://blogs.windows.com/windowsdeveloper/2026/10/07/microsoft-execution-containers-policy-driven-containment-for-ai-agents/):
  - **Process containers** use AppContainer, Seatbelt or Bubblewrap.
  - **Session containers** are Windows 11 only. They run "under a distinct Windows account and session" with "isolated desktop, clipboard, UI, and input boundaries", and are aimed at "long-running agents and automation that need a desktop".
  - Intune policy for process containers is "soon".
  - The post does not mention MCP.
- The companion post ([Windows Experience Blog](https://blogs.windows.com/windowsexperience/2026/10/07/building-windows-for-hybrid-intelligence/)):
  - Says MXC is "generally available on Windows 11".
  - Names agents that already support it: Codex, GitHub Copilot, OpenClaw, Replit, LM Studio, NVIDIA OpenShell and Unsloth.
  - Names agents that are "coming": Anthropic Claude Code, Simular, Manus, Perplexity, Raycast and Hermes Agent, among others.
  - Announces "thousands of new actions" in Windows Search (experimental channel) and Copilot "local actions" on Copilot+ PCs "in the coming months".
  - Contains no MCP-on-Windows, agent-connector or App Actions news.
- **Older baseline:** Windows 11 Insider build 26220.7344 brought native MCP with File Explorer and Settings agent connectors and the on-device registry (December 2025 per secondary coverage) — [Thurrott](https://www.thurrott.com/windows/330450/new-windows-11-insider-build-brings-file-explorer-and-settings-connectors-for-ai-agents), [MS Learn MCP on Windows](https://learn.microsoft.com/en-us/windows/ai/mcp/overview). The agent workspace runs as a separate agent account — [Microsoft Support](https://support.microsoft.com/en-us/windows/ai/ai-features/experimental-agentic-features)

**Other projects (little or nothing in the window)**
- **Microsoft UFO.** The latest release is v3.0.10 (2026-09-22). The only commits in the window are a 2026-10-14 security merge (#360, CWE fixes, with "CWE-918 — DNS rebinding: Already fixed by existing IP pinning"). Open PRs fix MCP env overrides (#363) and config caching (#364) — [releases](https://github.com/microsoft/UFO/releases), [commits](https://github.com/microsoft/UFO/commits/main)
- **ByteDance UI-TARS-desktop.**
  - v0.3.1 (2026-10-08, just before the window) is a security release: the CLI server listens on 127.0.0.1 by default, a non-loopback `--host` requires an auth token of at least 16 characters, and other hosts need `TARKO_ALLOWED_HOSTS` — [v0.3.1](https://github.com/bytedance/UI-TARS-desktop/releases/tag/v0.3.1)
  - No commits since 2026-10-09.
  - Open PR #2051: "stop debug console.log from polluting the stdio JSON-RPC channel" — [PRs](https://github.com/bytedance/UI-TARS-desktop/pulls)
- **Simular Agent S.**
  - Agent S4, "evolving tool interfaces for computer-use agents", was merged 2026-10-21. A Builder agent evolves the Python "shadow interface" that the task agent imports. Fitness is the benchmark score on fresh AWS VMs (OSWorld-V2, ScienceBoard). The smoke test used Qwen3.8-27B — [PR #240](https://github.com/simular-ai/Agent-S/pull/240)
  - No new release; the latest is v0.3.2 (2025-12-16) — [releases](https://github.com/simular-ai/Agent-S/releases)
- **Bytebot.** The repository is archived; the last push was 2025-09-12 — [repo](https://github.com/bytebot-ai/bytebot)
- **Open Interpreter.** The latest release is rust-v0.0.56 (2026-10-07). There is one commit in the window (2026-10-11, "Validate Codex 0.159 model compatibility profile for OIX") and no OS-mode changes — [releases](https://github.com/openinterpreter/open-interpreter/releases)

### Inferences
- Windows-MCP is converging on the same "a person can see, pause and take over" model as computer-use-mcp's 7.6.1 status card. Its bug reports (#456, #465, #474/#481, #478, #498) are a ready-made list of the failure modes a hook-based user-activity guard runs into on Windows. Most of them apply directly to computer-use-mcp's Windows user-active guard, which also uses low-level hooks (see Q5).
- In this window cua's Windows work was about making background (PostMessage) delivery deterministic and refusing honestly when it can't. Its Linux work was about window identity across Wayland, XWayland and GTK4 CSD, and about GNOME helper safety.
- With Plasma 6.8 (2026-10-14), every mainstream KDE session is Wayland. Linux tooling that assumes X11 (xdotool, wmctrl, scrot) now only reaches XWayland clients there.
- MXC session containers are the first GA Microsoft primitive that gives an agent its own desktop and input. An MCP desktop server may soon be launched inside one. Nothing found says whether capture and input APIs behave normally there (see Gaps).

### Gaps
- Windows-MCP's #309 UAC mode is on a feature branch. I could not tell whether it will reach main.
- I did not inspect the cua-sdk, Cua Spaces or cua-spacesd release notes in detail. Cua Spaces appears to be a separate remote-desktop product.
- I found no Microsoft announcement in 2026-10-11 to 2026-10-23 about MCP on Windows, agent connectors, App Actions or agent workspace. The October Windows Insider build notes were not indexed in search.
- The PR number of computer-use-linux's v0.7.18 is #260, taken from the commit log; the release body did not include it.

## Q2. Windows window capture: occluded, UWP and DirectComposition windows, and the pitfalls

### Takeaway
The working ladder in the field is cua's: PrintWindow with the undocumented `PW_RENDERFULLCONTENT` (0x2), then Windows.Graphics.Capture (WGC) when the result comes back black, then a desktop-region BitBlt with an explicit "occluded" flag. WGC has the border and cursor switches but cannot capture minimized windows, and disabling the yellow border officially needs a user-consent call. Windows-MCP doesn't capture windows at all: it crops a full-screen DXGI, mss or GDI grab. The other pitfalls to design for are DPI virtualization in DPI-unaware processes, a locked or RDP-disconnected desktop, and VM or RDP sessions where DXGI returns empty frames.

### Cited Findings
- **cua-driver-rs capture.rs (main, 2026-10-23).**
  - The module doc says: "`PW_RENDERFULLCONTENT` (0x2) renders the window contents even if it is occluded or off-screen for GDI-backed surfaces". It adds that `PrintWindow` "doesn't capture DirectComposition-backed surfaces — modern UWP / WinUI3 apps (Calculator, Photos, Settings, Win 11 Notepad) … Result is an all-black image."
  - Black detection samples every 64th pixel. The threshold is "intentionally aggressive — UWP apps return all-zeros bitmaps".
  - [capture.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/capture.rs)
- **cua's fallback order in code.**
  - The comment reads: "A freshly restored DirectComposition window can temporarily have no usable GDI surface even though DWM is already rendering it. WGC … is therefore the right first fallback".
  - If WGC fails ("Headless/virtualized Windows sessions can expose DWM but no WGC-compatible hardware device"), the code falls back to a desktop-region BitBlt.
  - Before that crop it runs `target_is_obscured`, which samples `WindowFromPoint` at the centre and four corners inset by 2 px, and returns an `occluded` flag. This came from a real regression: "a backgrounded Notepad screenshot returned LibreOffice's pixels".
  - Minimized windows return an error and do not fall through.
  - [capture.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/capture.rs)
- **cua wgc.rs.**
  - The minimum OS in the comment is Windows 10 1903. WGC "Cannot capture **minimized** windows".
  - It uses `IGraphicsCaptureItemInterop::CreateForWindow`, a D3D11 device with BGRA support, and `Direct3D11CaptureFramePool::CreateFreeThreaded` with 2 frames. The comment explains: "`Create` requires the calling thread to have a CoreDispatcher/event loop … Without this, FrameArrived silently never fires".
  - It then polls `TryGetNextFrame` every 50 ms, because FrameArrived "never fired in our daemon's thread environment — likely an STA/COM-apartment mismatch".
  - It calls `SetIsBorderRequired(false)` and `SetIsCursorCaptureEnabled(false)` on a best-effort basis.
  - First call per process costs about 50 ms for D3D11 device creation.
  - [wgc.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/wgc.rs)
- **cua: WGC frames carry no screen origin.** The comment: "WGC supplies no proven screen origin, so it cannot produce mapped click evidence yet". Click-target evidence is captured only on the PrintWindow or region paths — [capture.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/capture.rs)
- **WGC API versions (Microsoft Learn).**
  - `GraphicsCaptureSession` exists since Windows 10 1803 (10.0.17134), UniversalApiContract v6. `IsCursorCaptureEnabled` was added in 2004 (19041) — [MS Learn GraphicsCaptureSession](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession)
  - `IsBorderRequired` was introduced in 10.0.20348.0 (UniversalApiContract v12). The docs say: "Before the system will disable the colored border … your app must get consent from the user by calling GraphicsCaptureAccess.RequestAccessAsync, passing in … GraphicsCaptureAccessKind.Borderless, which displays a prompt". If the user denies, setting false "will succeed, but the value will be ignored". The call requires the `graphicsCaptureWithoutBorder` capability in the package manifest. If any other app requires a border for the same window, the border shows — [MS Learn IsBorderRequired](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession.isborderrequired)
  - The session also has `IncludeSecondaryWindows`, `MinUpdateInterval` and `DirtyRegionMode` — [MS Learn GraphicsCaptureSession](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscapturesession)
- **PrintWindow and `PW_RENDERFULLCONTENT`, from Chromium and WebRTC.**
  - Chromium's snapshot code calls the flag "undocumented, but works starting in Windows 8.1. It allows for capturing the contents of the window that are drawn using DirectComposition" — [Chromium snapshot_win.cc](https://chromium.googlesource.com/chromium/src/+/125.0.6422.5/ui/snapshot/snapshot_win.cc)
  - A WebRTC commit says PrintWindow without it "fails when trying to capture apps that are using DirectComposition" — [WebRTC commit](https://webrtc.googlesource.com/src/+/f89110d67902e787f6745ad2b52f7f09fc808512)
  - cua's experience (above) is that even with the flag, some UWP and WinUI3 surfaces still come back black. This is from a code comment and not independently verified.
- **Windows-MCP capture (main).**
  - Backends are pluggable through an env var: `dxcam` (DXGI Desktop Duplication), `mss`, and PIL `ImageGrab`. They capture the screen and crop it to the window or region rect, so there is no per-window or occluded-window capture.
  - A backend that returns an unusable frame is added to `_degraded_backends` and skipped for the rest of the process: "On VM/RDP desktops dxcam can initialize successfully and then return empty frames" (issue #371).
  - Validity checks look only at structure, "never content — a legitimately black screen is a perfectly valid screenshot".
  - [screenshot.py](https://github.com/CursorTouch/Windows-MCP/blob/main/src/windows_mcp/desktop/screenshot.py)
  - Its control overlay uses `WDA_EXCLUDEFROMCAPTURE` (code search hit) — [control_overlay.py](https://github.com/CursorTouch/Windows-MCP/blob/main/src/windows_mcp/desktop/control_overlay.py)
  - The open PR #471 fixes "fast-capture metadata and coordinate mapping" in Snapshot — [PR #471](https://github.com/CursorTouch/Windows-MCP/pull/471)
- **Locked or disconnected desktop (cua #5266, merged 2026-10-15, in 0.36.0).**
  - Before, a locked machine or a closed RDP window produced a raw "`BitBlt failed: The handle is invalid. (0x80070006)`".
  - `desktop_unavailable()` combines `WTSQuerySessionInformationW(WTSConnectState)` (disconnected) with the input desktop name (`Winlogon`, or no access, means locked). It was verified on an Azure Windows 11 25H2 VM.
  - Capturing the lock screen itself "needs a SYSTEM service plus a session helper (the AnyDesk / Chrome Remote Desktop pattern)".
  - [PR #5266](https://github.com/trycua/cua/pull/5266)
- **Coordinate scaling (cua #5567, in 0.38.0).** Windows scroll targets "now use the selected session screenshot's scale, refuse missing or foreign screenshot context, and avoid double-scaling trusted native pixels" — [PR #5567](https://github.com/trycua/cua/pull/5567)
- **Own overlay windows.** cua's Windows `list_windows` now omits the driver's own overlay windows "before assigning z-index" ([PR #5566](https://github.com/trycua/cua/pull/5566)). Windows-MCP skips its own hwnds by PID ([PR #476](https://github.com/CursorTouch/Windows-MCP/pull/476)). cua's overlay also uses `WDA_EXCLUDEFROMCAPTURE` (code search hit) — [overlay.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/overlay.rs)
- **DPI pitfalls (Microsoft Learn, a general doc updated 2026-09-10, not new).**
  - "By default, the system considers desktop applications DPI unaware and bitmap-stretches their windows."
  - "If a DPI-unaware thread queries the screen size while running on a high-DPI display, Windows will virtualize the answer … as if the screen were in 96 DPI units." The doc advises: "make sure your thread is running in the DPI context you expect when interacting with the screen or individual windows" (via `SetThreadDpiAwarenessContext`, then restore it).
  - PMv2 needs Windows 10 1703. Under PMv2 the app sees "the raw pixels of each display".
  - [MS Learn High DPI](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows)
- **A user report of mixed capture paths (2026-10-23).** A second capture tool "can produce different pixels (different capture backend, different DPI awareness, different scaling), so coordinates measured in one image do not line up". The setup was 1920x1080 at 125% — [Windows-MCP #496](https://github.com/CursorTouch/Windows-MCP/issues/496)

### Inferences
- A per-window ladder for computer-use-mcp's Rust addon, modelled on cua:
  1. PrintWindow(`PW_RENDERFULLCONTENT`) with black-frame detection.
  2. WGC with a CreateFreeThreaded pool and polling, `IsCursorCaptureEnabled=false`, and `IsBorderRequired=false` best-effort.
  3. Region BitBlt or DXGI crop with an occlusion probe and an explicit `occluded: true` in the result.
  4. A structured `minimized` refusal that suggests `unhide` or `restore`.

  This would fix the "black for UWP like Calculator" defect named in the brief.
- WGC frames need their own geometry mapping. One way is `DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)` at capture time. The 7.6 macOS contract of `screen_origin + box` would then hold on Windows, and you would avoid cua's "no proven screen origin" limitation. This is my suggestion; I did not verify it in competitors' code.
- The borderless path probably cannot get official consent from an unpackaged `node.exe` host. `RequestAccessAsync(Borderless)` needs a manifest capability. Expect the yellow border on some builds and document it. This is an inference from the docs.
- Classifying "locked" and "RDP disconnected" (cua #5266) is cheap and directly improves error messages for the existing full-screen DXGI/BitBlt path.

### Gaps
- I could not confirm from Microsoft docs that `PW_RENDERFULLCONTENT` fails for specific UWP/WinUI3 apps. The evidence is cua's code comment only.
- I could not confirm whether `SetIsBorderRequired(false)` takes effect for unpackaged Win32 processes without a consent prompt on current Windows 11 builds. Competitors call it "best-effort".
- I found no competitor using DXGI Desktop Duplication for per-window capture, and no write-up of mixed-DPI multi-monitor pitfalls specific to WGC from this window.
- I could not determine whether `node.exe` ships a DPI-awareness manifest. If it does not, every Win32 coordinate API the addon calls may be virtualized on scaled displays. This needs a test on a 125% or 150% display.

## Q3. Windows input: background delivery, keeping the main loop free, cancellation and emergency stop, and the limits of low-level hooks

### Takeaway
Competitors use UI Automation patterns first and posted window messages (PostMessage) for background work. They keep SendInput for explicit foreground dispatch. In this window cua made PostMessage clicks deterministic by suspending the target GUI thread around the three posts, and made foreground drags refuse when another window covers the target. Windows-MCP's month was about the hard parts of a physical-input guard: missed releases, IME mode keys, zero-delta mouse noise, accidental takeover from small movements, and keys left down after interrupted chords. It also showed that a single UIA worker with no COM timeouts can block every later call for minutes.

### Cited Findings
- **cua: background click with the target thread suspended (#5584, in 0.38.0).**
  - The bug: SDL2 handles a posted `WM_MOUSEMOVE` by calling `TrackMouseEvent(TME_LEAVE)`. With the real cursor elsewhere, `WM_MOUSELEAVE` gets queued, and SDL reports the release off-target, so "the click is dropped".
  - The fix in `post_click_on`: `SuspendThread` on the window's GUI thread. It refuses tid 0 and its own thread, then calls `GetThreadContext` as a barrier "because SuspendThread is asynchronous". It then posts move, press and release, and resumes.
  - It keeps "UIPI checks, NoActivateGuard ordering, foreground restoration, double-click selection, and the 80 ms repeat gap".
  - [PR #5076 (problem)](https://github.com/trycua/cua/pull/5076), [PR #5584 (landed)](https://github.com/trycua/cua/pull/5584)
- **cua: foreground drags (#5616, in 0.38.0).** "Window-targeted foreground drags activate and hit-test the target before pressing, refuse with foreground_unavailable when covered, and check move/release insertion with release recovery" — [PR #5616](https://github.com/trycua/cua/pull/5616)
- **cua: UIA reads (#5582, #5082).** Traversal completeness is now reported. Verification stays "conservative for projected UIA rows" ([PR #5582](https://github.com/trycua/cua/pull/5582)). It also tolerates "a transient UIA read" on Windows (#5082) — [0.35.2](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.35.2)
- **cua baseline confirmed.** Releases still describe Windows "background" versus "foreground" delivery and a `foreground_unavailable` refusal. The window-only foreground hotkeys go "through the HID activation guard" (#5522) — [0.38.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0)
- **Windows-MCP: UIA on a dedicated worker with no timeout blocks everything (#497).** Cancelling the MCP request "can't interrupt the COM call on the single worker". The fix is `CUIAutomation8` and `IUIAutomation2` with `ConnectionTimeout` 2000 ms and `TransactionTimeout` 5000 ms, with no retry of timed-out windows — [PR #497](https://github.com/CursorTouch/Windows-MCP/pull/497)
  - Microsoft documents that the default `TransactionTimeout` "is 20 seconds" (Windows 8+, UIAutomationCore.dll) — [MS Learn put_TransactionTimeout](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation2-put_transactiontimeout)
- **Windows-MCP: cancellation and takeover hygiene (#466).** Input checkpoints are revoked when a gated request ends, preventing "subsequent input from stale workers after takeover or cancellation. Already dispatched OS actions are not undone" — [PR #466](https://github.com/CursorTouch/Windows-MCP/pull/466)
- **Windows-MCP: emergency release of injected keys.** SendKeys tracks pending releases and sends them in reverse on any exception or `KeyboardInterrupt` ([PR #485](https://github.com/CursorTouch/Windows-MCP/pull/485)). Main already used "input-ledger cleanup for MultiSelect and horizontal Scroll" ([PR #485](https://github.com/CursorTouch/Windows-MCP/pull/485)). Issue #483 records that a stuck synthetic Ctrl makes "the entire desktop keyboard stop working until the user physically presses and releases that key" — [#483](https://github.com/CursorTouch/Windows-MCP/issues/483)
- **Limits of low-level hooks, from Windows-MCP field reports.** Each is a separate way a hook-based "user is active" guard fails:
  - Missed physical key-up events, for example from an elevated Alt-Tab replacement. Fixed by `GetAsyncKeyState` reconciliation — [#460](https://github.com/CursorTouch/Windows-MCP/pull/460)
  - IME mode keys whose async state stays set — [#481](https://github.com/CursorTouch/Windows-MCP/pull/481)
  - Zero-delta `WM_MOUSEMOVE` from some wireless receivers, still open — [#498](https://github.com/CursorTouch/Windows-MCP/issues/498)
  - Indicator heartbeat stalls under concurrent tool calls — [#465](https://github.com/CursorTouch/Windows-MCP/issues/465)
  - Small accidental movements. Fixed by Raw Input relative-motion accumulation with a 500-unit threshold, a 0.5 s gap reset, and injected input excluded — [#466](https://github.com/CursorTouch/Windows-MCP/pull/466)
- **Windows-MCP: gate scope.** By default only direct desktop input is gated. Background tools (PowerShell, FileSystem, Registry, Process, Clipboard) are not, and `balanced` and `strict` widen the gate — [#466](https://github.com/CursorTouch/Windows-MCP/pull/466)
- **Windows-MCP: UIPI and the Secure Desktop.** Feature-branch PR #309 needs a UIAccess-token worker started by a LocalSystem service before `SendInput` can reach the System-integrity `consent.exe`. Without it, "every admin-elevation prompt is a hard stop" — [PR #309](https://github.com/CursorTouch/Windows-MCP/pull/309)
- **computer-use-mcp, for reference (local grep).**
  - Windows input is `SendInput` only ([native/src/mouse.rs], [native/src/keyboard.rs], the latter batching all key events in one call).
  - The user-active guard uses `SetWindowsHookExW(WH_MOUSE_LL / WH_KEYBOARD_LL)` with `LLKHF_INJECTED/LLMHF_INJECTED` filtering ([native/src/activity.rs]).
  - UIA is created with `CoCreateInstance(&CUIAutomation, …)`, the v1 coclass ([native/src/accessibility.rs:91]).
  - Source: local repository files, read 2026-10-23.

### Inferences
- computer-use-mcp's Windows guard (WH_*_LL hooks) is exposed to the same failure modes Windows-MCP hit: zero-delta moves, missed releases, IME mode keys and jitter. Cheap mitigations:
  - Ignore mouse events whose position did not change.
  - Reconcile held-key state with `GetAsyncKeyState` before reporting `user_active`.
  - Treat VK 0xF3/0xF4 at scan code 0x29 as activity, not as a held key.
  - Consider a motion threshold rather than "any event" for the 4000 ms idle rule.
- computer-use-mcp creates UIA from the v1 `CUIAutomation` with no timeouts, so one hung window can stall `get_ui_tree`, `find_element` and `click_element` for up to Windows' internal limits. Switching to `CUIAutomation8` with a 2 s connection timeout and a 5 s transaction timeout is a small, well-evidenced change.
- A `delivery: "pid"` equivalent on Windows would need PostMessage clicks. cua's suspended-thread technique and its refusal codes are the reference. Their own caveat is that it is validated in CI only through a Windows GUI e2e script.
- If the status card's PowerShell/WPF window shows up in UIA traversal or `list_windows`, filter it by PID, as both competitors now do for their overlays. I did not check this against computer-use-mcp.

### Gaps
- I did not find Windows-MCP's or cua's exact physical-input *blocking* mechanism (the baseline's "physical-input block") in this window's PRs. Only takeover and gating changed.
- No competitor documented cancelling a long `hold_key` or drag mid-gesture on Windows beyond release-on-exception and checkpoint revocation. cua's "release recovery" in #5616 is not described in detail.
- None of the sources quantified PostMessage reliability across app frameworks. cua cites SDL2 and Electron specifically.

## Q4. Linux: Wayland support (portals, libei, ydotool), AT-SPI quality and speed, window listing without wmctrl, X11 versus Wayland detection

### Takeaway
The serious Linux servers are now Wayland-first, with backends specific to each compositor:
- **Window lists:** a GNOME Shell extension or Introspect, KWin D-Bus scripting, `hyprctl`, niri IPC, i3 IPC, a COSMIC helper, and EWMH last.
- **Screenshots:** the GNOME Shell D-Bus Screenshot method, then the portal, then X11 `GetImage`.
- **Input:** the RemoteDesktop portal with EIS/libei, or `/dev/uinput`, with ydotool as the fallback.

AT-SPI is used first for semantic actions, but it needs wake-up tricks for Chromium and WebKit. The X11 typing paths turned out to be lossy under non-US layouts and keyboard grabs. With Plasma 6.8 dropping X11 sessions, X11-only tooling now reaches only XWayland clients on KDE.

### Cited Findings
- **computer-use-linux (agent-sh), Wayland input.** "Pointer actions use `/dev/uinput` or `org.freedesktop.portal.RemoteDesktop` on Wayland, with `ydotool` / `ydotoold` as the fallback."
  - Literal text prefers KDE clipboard integration on Plasma, `wtype` on compatible compositors, and portal keysyms elsewhere, including GNOME.
  - "Portal text startup or conversion errors fail the call without replaying text through ydotool."
  - "Raw ydotool text accepts printable ASCII, tab and newline only, and its physical US key positions can produce different text under the active layout."
  - [README](https://github.com/agent-sh/computer-use-linux#readme)
- **computer-use-linux, screenshot ladder.** "GNOME Shell DBus screenshot method when present, `org.freedesktop.portal.Screenshot` otherwise, then on a native X11 session a root-window `GetImage` … and finally spawn `gnome-screenshot` for background/systemd contexts". Payloads are capped at 1920 px and 2 MiB by default, and metadata returns `coordinate_width`, `coordinate_height` and `scale` — [README](https://github.com/agent-sh/computer-use-linux#readme)
- **computer-use-linux, window registry order.** "GNOME Shell extension, GNOME Shell Introspect, COSMIC Wayland helper, KWin DBus scripting, Hyprland `hyprctl`, the niri IPC socket, i3 IPC, and generic X11/EWMH … then reports exactly which backend won or why each backend failed."
  - On GNOME Wayland the extension is needed "when `org.gnome.Shell.Introspect` is locked down".
  - KWin uses "temporary KWin DBus scripting" (Plasma 5 or 6).
  - Sway and generic wlroots have "no dedicated backend yet".
  - For EWMH it notes "`wmctrl -lG` counts the frame offset twice".
  - It was validated on Ubuntu 25.10 with GNOME Shell 50.1 on Wayland, and on niri 26.04.
  - [README](https://github.com/agent-sh/computer-use-linux#readme)
- **computer-use-linux, indicator excluded from capture without an affinity API.** The overlay "hides automatically under a shared capture lock before any screenshot is read". It uses `wlr-layer-shell` shared-memory rendering, or native Shell actors via the bundled extension on GNOME. "A missing or invalid acknowledgement, a stalled socket, or a failed lock returns a capture error." Pointer actions wait 350 ms so the cursor glyph lands first — [README](https://github.com/agent-sh/computer-use-linux#readme)
- **computer-use-linux, keymap preflight.** On GNOME, "a read-only keymap preflight rejects the whole string before input if a character is absent or requires a modifier level Mutter cannot synthesize". It needs `libxkbcommon.so.0` and has a 2 s deadline — [README](https://github.com/agent-sh/computer-use-linux#readme)
- **computer-use-linux, X11 typing fidelity.** xdotool and XTEST "can silently substitute symbols under non-US XKB layouts (reported with Brazilian `br`/ABNT2)". v0.7.21 and v0.7.22 detect layout replacement, keyboard grabs and focus changes during dispatch and return an error. They do not replay, and they cannot repair already-typed bytes — [v0.7.21](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.21), [v0.7.22](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.22)
- **cua, X11 typing of unmapped characters.** Characters get temporary keycode remaps. Text with more distinct unmapped characters than free keycodes used to fail with "typed 0 of 4 characters". It is now batched, and each batch restores its remaps ([PR #5168](https://github.com/trycua/cua/pull/5168)). The driver waits "for the client before restoring a borrowed keycode" (#5172) — [0.36.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.36.0)
- **cua, libei and GNOME.**
  - 0.34.1 waits for "EIS to acknowledge libei input before replying" and captures GNOME windows "from their own actor" — [0.34.1](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.34.1)
  - 0.38.0 refuses GNOME 50 and newer for its helper extension "despite reports of session-ending crashes with the helper active". GNOME 45–49 stay supported ([PR #5565](https://github.com/trycua/cua/pull/5565)). It also accepts the helper "only from the session's Shell" ([PR #5496](https://github.com/trycua/cua/pull/5496))
- **cua, window identity across Wayland and XWayland.**
  - `get_accessibility_tree` had still enumerated windows "directly through X11", so native Wayland windows were missing. It now uses the Wayland/X11 dispatcher ([PR #5286](https://github.com/trycua/cua/pull/5286), landed as [#5368](https://github.com/trycua/cua/pull/5368))
  - When EWMH client lists are empty, it runs a bounded depth-first ICCCM client search ([PR #5597](https://github.com/trycua/cua/pull/5597))
  - It lists untitled managed X11 windows ([#5341](https://github.com/trycua/cua/pull/5341))
  - It undoes the GTK4 client-side-decoration inset before hit-testing ([PR #5610](https://github.com/trycua/cua/pull/5610))
- **AT-SPI quality.**
  - Chromium and Electron expose only frames until a client requests application attributes. cua calls `GetAttributes` once per PID before the first traversal, ignoring the result ([PR #5074](https://github.com/trycua/cua/pull/5074))
  - WebKitGTK page content has to be read "through well-known AT-SPI child references" ([computer-use-linux v0.7.21](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.21))
  - cua stopped worker processes launching Orca on GNOME (#5179) ([0.36.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.36.0))
  - computer-use-linux reports `accessibility_tree_truncated` when node, depth or read budgets stop a traversal ([README](https://github.com/agent-sh/computer-use-linux#readme))
- **The RemoteDesktop portal spec (freedesktop docs, a stable spec, not new).**
  - `ConnectToEIS` was "added in version 2". It must be called after `Start()`, once per session, and returns a libei sender fd. After that, "input must go through EIS, and `Notify*` calls return an error".
  - `NotifyPointerMotionAbsolute` takes a PipeWire stream node ID and coordinates in that stream's `logical_size` space.
  - `persist_mode` is 0 (none), 1 (while running) or 2 (until revoked). The `restore_token` is single-use, so each new session's token must be stored. Combined RemoteDesktop+ScreenCast persistence is "managed only through this portal".
  - Device bitmask: KEYBOARD 1, POINTER 2, TOUCHSCREEN 4.
  - Clipboard needs `Clipboard.RequestClipboard()` before `Start()`.
  - [portal docs](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html)
- **mirsella/computer-use-mcp, a KDE-only reference.** It needs "An XDG RemoteDesktop portal with EIS support for generated input" and PipeWire ≥ 1.0. Paste "uses the portal Clipboard capability when negotiated", falling back to simulated EIS typing. Its private-session runner installs "private KDE RemoteDesktop authorization" so there is no prompt inside the isolated session — [repo](https://github.com/mirsella/computer-use-mcp)
- **GNOME Shell D-Bus lockdown.** GNOME (41 and later) restricts private and debug Shell D-Bus interfaces, including `org.gnome.Shell.Eval` ("the most sensitive D-Bus method we expose"), to expected callers unless the shell runs in "unsafe mode". The recommended alternative is an extension that exposes its own D-Bus method. These are secondary sources — [GNOME Discourse](https://discourse.gnome.org/t/terminal-command-to-open-app-drawer-and-switch-between-applications/8226), [gnome-shell restrict-dbus-callers patch](https://git.centos.org/rpms/gnome-shell/blob/c9/f/SOURCES/restrict-dbus-callers.patch)
- **KDE Plasma 6.8 (2026-10-14).** X11 sessions are retired, and XWayland is kept for individual apps — [KDE](https://kde.org/announcements/plasma/6/6.8.0/)
- **X11 versus Wayland detection.** computer-use-linux re-runs session discovery when session variables change and retries failed discovery. Its MCP launch environment must carry `DBUS_SESSION_BUS_ADDRESS`, `XDG_RUNTIME_DIR`, portals, AT-SPI and `ydotoold` ([README](https://github.com/agent-sh/computer-use-linux#readme)). cua checks "PID-owned X11 identities and complete owned-window cardinality before Wayland adapters" in mixed sessions ([PR #5597](https://github.com/trycua/cua/pull/5597))

### Inferences
- computer-use-mcp's Wayland window listing calls `gdbus` with a `global.get_window_actors()` script (`list_windows_wayland` in [native/src/windows.rs], local). That relies on `org.gnome.Shell.Eval`, which stock GNOME blocks outside unsafe mode. On a normal GNOME Wayland desktop it most likely returns nothing, and the code then falls back to X11 tools, which see only XWayland windows. This is strongly suspected but not tested here.
- computer-use-mcp's Linux screenshot chain is `gnome-screenshot`, then `grim` (wlroots only), then `scrot` or `import` (X11) ([native/src/screenshot.rs], local). It has no portal Screenshot, no GNOME Shell D-Bus Screenshot and no KWin or Spectacle path. On Plasma 6.8 (Wayland only) that likely leaves no working full-screen capture unless `gnome-screenshot` happens to be installed and works.
- Detection is `XDG_SESSION_TYPE == "wayland"`, cached once per process in a `OnceLock` ([native/src/windows.rs], [native/src/keyboard.rs], local). Competitors also probe compositor-specific sockets and D-Bus names and say which backend won. A `doctor` field naming the chosen Linux backend per capability would match computer-use-linux's readiness report.
- A Linux status card could follow computer-use-linux's capture-lock-and-acknowledge protocol, since Linux has no `WDA_EXCLUDEFROMCAPTURE`. The overlay hides and acknowledges before each capture, and a missing acknowledgement fails the capture rather than leaking the overlay into the image.

### Gaps
- I did not measure AT-SPI traversal speed. Neither project published timings in this window.
- I did not confirm whether GNOME 51 (in Ubuntu 26.10) changed Introspect, Eval or Screenshot access, or still ships an X11 session.
- I did not confirm that Plasma 6.8 shipped libei/EIS emulated input in KRdp or the portal. The evidence is a pre-release Phoronix snippet.
- I found no Linux server using the ScreenCast portal plus PipeWire for per-window capture other than mirsella's KDE-only one. Its capture details were not read.

## Q5. Which of these does computer-use-mcp lack on Windows and Linux?

### Takeaway
On Windows, computer-use-mcp lacks:
- The PrintWindow → WGC → occlusion-flagged crop ladder (its window capture is GDI BitBlt from the window DC).
- Explicit DPI-awareness handling.
- Bounded UIA calls (it uses v1 `CUIAutomation`).
- A background (PostMessage) click path.
- "Locked / RDP disconnected" classification.
- The guard hardening Windows-MCP learned this month.

On Linux, it lacks portal and libei input, portal and GNOME Shell D-Bus screenshots, compositor-aware window listing that works on stock GNOME, KDE, Hyprland and niri, AT-SPI wake-ups for Chromium and WebKit, X11 typing-fidelity checks, and a status card.

### Cited Findings
- **Windows window capture is GDI BitBlt from the window DC.** The comments read "Capture a specific window via GDI BitBlt" and "GDI BitBlt (fallback)". Full screen uses DXGI `DuplicateOutput` with a BitBlt fallback. There is no `PrintWindow`, `PW_RENDERFULLCONTENT` or `GraphicsCapture` anywhere in `native/src` — local grep of [native/src/screenshot.rs] (repository file, 2026-10-23). Competitor technique: [cua capture.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/capture.rs), [cua wgc.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/wgc.rs)
- **No DPI-awareness API.** No `SetProcessDpiAwareness`, `SetThreadDpiAwarenessContext` or `DPI_AWARENESS` call appears in `native/src` (local grep). Microsoft warns that values "might be virtualized" in DPI-unaware or system-aware contexts — [MS Learn High DPI](https://learn.microsoft.com/en-us/windows/win32/hidpi/high-dpi-desktop-application-development-on-windows)
- **UIA has no timeouts.** It uses `CoCreateInstance(&CUIAutomation, …)` ([native/src/accessibility.rs:91], local). Competitor fix: [Windows-MCP #497](https://github.com/CursorTouch/Windows-MCP/pull/497). The documented default is 20 s: [MS Learn](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation2-put_transactiontimeout)
- **Windows input is SendInput only.** PostMessageW appears only in the overlay code ([native/src/mouse.rs], [native/src/keyboard.rs], [native/src/overlay.rs], local). Competitor technique: [cua #5584](https://github.com/trycua/cua/pull/5584), [cua #5616](https://github.com/trycua/cua/pull/5616)
- **The user-active guard on Windows uses WH_MOUSE_LL and WH_KEYBOARD_LL with injected-flag filtering** ([native/src/activity.rs], local). Known failure modes of that design: [#460](https://github.com/CursorTouch/Windows-MCP/pull/460), [#466](https://github.com/CursorTouch/Windows-MCP/pull/466), [#481](https://github.com/CursorTouch/Windows-MCP/pull/481), [#498](https://github.com/CursorTouch/Windows-MCP/issues/498)
- **Linux.**
  - Wayland window listing goes through `gdbus` with a `global.get_window_actors()` script, then falls back to X11 tools "via XWayland" ([native/src/windows.rs:45-63, 127-135], local).
  - Screenshots: `gnome-screenshot`, then `grim`, then `scrot` or `import` ([native/src/screenshot.rs:22-113], local).
  - Wayland keyboard input uses ydotool evdev codes ([native/src/keyboard.rs:117], local).
  - AT-SPI runs through a Python bridge using `Atspi.get_desktop(0)` ([libexec/linux-atspi.py], local).
  - The brief states there is no Linux status card. The competitor equivalents are cited in Q4.

### Inferences

Candidate adoptions, in my order of value to effort (my judgement, not a competitor's ranking):
1. **Windows UIA timeouts:** `CUIAutomation8` with `ConnectionTimeout` 2 s and `TransactionTimeout` 5 s, and mark windows that time out as failed. This is small, and the evidence is strong (#497 numbers).
2. **Windows window capture ladder:** PrintWindow(`PW_RENDERFULLCONTENT`) → WGC (free-threaded pool, polling, cursor off, border off best-effort) → crop with `occluded` flag → `minimized` refusal. This fixes Calculator, Settings and Win11 Notepad captures going black.
3. **Windows DPI:** set per-thread PMv2 (`SetThreadDpiAwarenessContext`) around every coordinate, window-rect and capture call in the addon, and test at 125% and 150% on mixed-DPI monitors.
4. **Windows guard hardening:**
   - Ignore zero-delta mouse moves.
   - Reconcile held keys with `GetAsyncKeyState`.
   - Treat IME mode keys as activity, not holds.
   - Consider a cumulative-movement threshold.
   - Make sure the status card failing never leaves the server permanently refusing (Windows-MCP #478 and #465 show that failure).
5. **Windows error classification:** "locked" (input desktop is Winlogon) and "RDP disconnected" (`WTSConnectState`) instead of raw capture errors.
6. **Linux window listing:** replace Shell.Eval with Introspect, a small bundled GNOME extension, or KWin scripting, `hyprctl`, niri IPC or i3 IPC. Report which backend won in `doctor`.
7. **Linux capture:** add the `org.freedesktop.portal.Screenshot` and GNOME Shell D-Bus Screenshot paths, because Plasma 6.8 is now Wayland-only.
8. **Linux input:** add the RemoteDesktop portal with `ConnectToEIS` (libei) as the first Wayland input path. Persist the single-use `restore_token` with `persist_mode=2`. Keep ydotool as a fallback, with its ASCII-only and US-layout limits documented.
9. **Linux AT-SPI:** add the Chromium `GetAttributes` wake-up, once per PID, to the Python bridge.
10. **Linux status card:** a layer-shell overlay or GNOME extension with a hide-and-acknowledge capture lock.

Also:
- computer-use-mcp's `delivery: "pid"` exists on macOS. A Windows equivalent built on PostMessage should copy cua's refusals (UIPI check, `foreground_unavailable` when covered) rather than silently fall back to SendInput.
- MXC session containers (GA 2026-10-07, Windows 11) may become the Windows analogue of "an agent-owned desktop". Testing computer-use-mcp inside one would show whether DXGI, WGC, SendInput and UIA work in that session.

### Gaps
- I have not run any of this against computer-use-mcp on Windows or Linux. The "lacks" items rest on source grep plus the brief's stated state, and the GNOME Eval failure is inferred from GNOME's documented lockdown, not observed.
- I did not check whether computer-use-mcp's PowerShell/WPF status card appears in its own `list_windows` or UIA traversal on Windows.
- I did not compare per-OS action-ledger or coverage counts (the cua baseline: Win32 122/122, X11 116/116) against computer-use-mcp, because no equivalent ledger was found for it.
