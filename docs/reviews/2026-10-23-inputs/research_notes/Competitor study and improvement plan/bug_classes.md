# Bug classes in desktop computer-use tools (2025-2026), mapped to computer-use-mcp

Scope and method. Competitor evidence comes from the GitHub issue trackers and merged PRs of steipete/Peekaboo (the repo now
redirects to openclaw/Peekaboo; issue bodies link there), trycua/cua (cua-driver), CursorTouch/Windows-MCP,
anthropics/claude-code (computer-use issues), openai/codex (computer-use issues), bytedance/UI-TARS-desktop and
microsoft/UFO, read with `gh issue view` on 2026-10-23. Mapping to computer-use-mcp comes from reading the source at
commit 1d054b4 (main). Nothing was executed on Windows or Linux and no native reproduction was run, so every mapping
is marked either **confirmed (read)**, meaning the code path exists as described, or **likely**, meaning the effect is
inferred from the code plus the competitor's measurement. File paths are relative to
the repository root.

## Key Question 1: What recurring bug classes did competitors hit and fix in 2025-2026?

### Takeaway
Thirteen classes recur across the trackers. The most frequent are: modifiers left held after an error or cancel;
coordinate-space mismatches (DPI virtualization, Retina scale, multi-monitor normalization); black or wrong captures;
input reported as delivered when it wasn't; wrong-window targeting; clipboard paste and restore races; Unicode and
keyboard-layout corruption; event-loop or COM hangs on large or hung accessibility trees; and subprocess or helper
lifecycle leaks. Most fixes are small and local: release in a guard, a different normalization formula, a manifest or
DPI call, a cancellation check, or a filter.

### Cited Findings

**1. Stuck modifiers and held keys or buttons**
- Peekaboo `press shift+tab --foreground` left `NSEvent.modifierFlags` at 131072 (Shift) after exit. A later click in Electron arrived with `metaKey: true` after `press cmd+w`. It affected releases 4.3.2 through 4.5.0 and main — [Peekaboo #797](https://github.com/steipete/Peekaboo/issues/797). The fix, in PR #803 and the 4.6.0 source tag: "Foreground chords clear their synthetic flags on terminal key-up, including cancellation cleanup" — [Peekaboo PR #803](https://github.com/openclaw/Peekaboo/pull/803)
- Windows-MCP `Shortcut()`, `MultiSelect()` and `Scroll()` press modifiers and release them only on the success path. `Shortcut("ctrl+comma")` throws `ord() expected a character` after Ctrl is already down, and `GetAsyncKeyState(VK_CONTROL)` then reads 0x8000, so every later keystroke becomes Ctrl+key. The issue is open as of 2026-10-21; a maintainer says the changes are made — [Windows-MCP #483](https://github.com/CursorTouch/Windows-MCP/issues/483)
- In cua Spaces, the Super key was sometimes left held in the guest X server after the viewer lost focus: the keydown arrived and the keyup never did. Open — [cua #5677](https://github.com/trycua/cua/issues/5677)
- In cua, the macOS right- and middle-click paths lack the left click's window id, activation policy and modifier handling — [cua #4692](https://github.com/trycua/cua/issues/4692)
- Windows-MCP's user-control gate latched permanently in the `user` state. One cause was that Japanese Hankaku/Zenkaku mode keys (VK 0xF3/0xF4) were bookkept as physical holds. Fixed 2026-10-14 and 2026-10-20 — [Windows-MCP #456](https://github.com/CursorTouch/Windows-MCP/issues/456), [Windows-MCP #474](https://github.com/CursorTouch/Windows-MCP/issues/474)

**2. Keyboard layout (non-US) and Unicode typing**
- On German QWERTZ, Peekaboo `type` produced `whoami // pwd // date // ls 8la ß head 8n 10` because characters were mapped to US key codes. The fix in 3.10.1: printable characters always use the Unicode event pair, hotkeys keep physical keycodes, and the US maps were deleted so the bug cannot silently come back — [Peekaboo #330](https://github.com/steipete/Peekaboo/issues/330)
- cua's VNC backend dropped Shift for punctuation (`_`→`-`, `(`→`9`) — [cua #3226](https://github.com/trycua/cua/issues/3226). In a Lume VM, `;`, `.` and `,` misbehaved until the user switched to an ANSI layout — [cua #12](https://github.com/trycua/cua/issues/12)
- Windows-MCP `Type` put `ord(char)` into the 16-bit `wScan` field, so code points above U+FFFF were truncated (U+1F30D became U+F30D) and the tool still reported success. The fix sends both surrogate halves — [Windows-MCP #436](https://github.com/CursorTouch/Windows-MCP/issues/436)
- Windows-MCP sized the clipboard buffer as `(len(text)+1)*2` using code points, which dropped one UTF-16 unit per astral character from the tail — [Windows-MCP #437](https://github.com/CursorTouch/Windows-MCP/issues/437)
- In Windows-MCP, a UIA tree containing emoji (surrogate pairs) crashed Snapshot with `UnicodeEncodeError` — [Windows-MCP #382](https://github.com/CursorTouch/Windows-MCP/issues/382)
- cua's AT-SPI `type_text` truncated multibyte UTF-8 in GTK3 entries because the length was taken in bytes instead of characters; `set_value` preserved every string — [cua #4754](https://github.com/trycua/cua/issues/4754)
- cua's Windows foreground `type_text` corrupted multiline and CJK text in Notepad. It was fixed with a restricted UIA value-write route, and a single-line CJK mismatch followed — [cua #4477](https://github.com/trycua/cua/issues/4477), [cua #4830](https://github.com/trycua/cua/issues/4830)
- After computer use on Windows, the Microsoft Pinyin IME candidate window stops appearing in every app — [claude-code #97444](https://github.com/anthropics/claude-code/issues/97444)
- `windows-mcp install` raised `UnicodeDecodeError` because GBK `schtasks` output was decoded as UTF-8 — [Windows-MCP #493](https://github.com/CursorTouch/Windows-MCP/issues/493)

**3. DPI, Retina and multi-monitor coordinate errors**
- cua-driver's Per-Monitor V2 manifest was embedded as a string-typed resource, so the loader never applied it. The process ran DPI-unaware and `get_screen_size` reported 3072x1728 on a 3840x2160 display at 125% — [cua #1879](https://github.com/trycua/cua/issues/1879)
- cua's TypeScript in-process SDK "inherits a DPI-unaware Node host" and captures only the DPI-virtualized upper-left part of the desktop. The standalone daemon is fine. Open — [cua #3449](https://github.com/trycua/cua/issues/3449). The same root cause showed up in the `cua-spacesd` host, where desktop geometry disagreed with DWM window bounds — [cua #4804](https://github.com/trycua/cua/issues/4804)
- A non-DPI-aware process gets virtualized coordinates from GetWindowRect, CopyFromScreen and SetCursorPos, while UI Automation reports physical pixels. On a 200% primary monitor that is almost exactly a 2x mismatch, and the resulting clicks are wrong but look plausible — [claude-code #93992](https://github.com/anthropics/claude-code/issues/93992)
- Windows-MCP's Snapshot returned physical coordinates (per-monitor aware) while pyautogui clicked in logical coordinates, so clicks were offset at 175% scaling — [Windows-MCP #86](https://github.com/CursorTouch/Windows-MCP/issues/86)
- Windows-MCP `mouse_event` passed `MOUSEEVENTF_ABSOLUTE` without `MOUSEEVENTF_MOVE`, so the click landed at the current cursor. The fix uses `Move|Absolute|VirtualDesk` with `round((x-left)*65535/max(width-1,1))`, which also fixed an observed off-by-one ((1999,2123) for a target of (2000,2124)) — [Windows-MCP #441](https://github.com/CursorTouch/Windows-MCP/issues/441)
- cua fixed a fence-post in the `MOUSEEVENTF_VIRTUALDESK` normalization that misrouted clicks at the seam between monitors in negative-X layouts — [cua #1981](https://github.com/trycua/cua/issues/1981). A foreground click on a secondary monitor landed on Progman (the desktop) on the primary — [cua #3613](https://github.com/trycua/cua/issues/3613). cua also mis-scaled a mixed-DPI rect by dividing by `GetDpiForWindow/96` without the monitor origin — [cua #4428](https://github.com/trycua/cua/issues/4428)
- Peekaboo window capture came back at half resolution on macOS 26 because `display.width / display.frame.width` became 1.0 (both values in the same units). The fix prefers `NSScreen.backingScaleFactor` — [Peekaboo #111](https://github.com/steipete/Peekaboo/issues/111). Peekaboo then opened a tracking issue to make the screenshot-to-input coordinate spaces explicit; reusing raw Retina image coordinates had shifted clicks by 2x — [Peekaboo #309](https://github.com/steipete/Peekaboo/issues/309)
- The cua macOS cursor overlay had the wrong origin when a mixed-scale monitor sat above and to the left of the primary — [cua #4907](https://github.com/trycua/cua/issues/4907). The UI-TARS click marker was offset on macOS Tahoe — [UI-TARS #1876](https://github.com/bytedance/UI-TARS-desktop/issues/1876)
- UI-TARS coordinate guards treat 0 as missing, which rejects valid (0, y) and (x, 0) positions — [UI-TARS #1964](https://github.com/bytedance/UI-TARS-desktop/issues/1964)

**4. Black, blank or wrong captures**
- Windows computer-use screenshots came back black even for granted apps — [claude-code #103212](https://github.com/anthropics/claude-code/issues/103212). On VMs/RDP, Windows Graphics Capture fails with `SetIsBorderRequired 0x80004002`, and Windows-MCP screenshots became undecodable after the first capture — [Windows-MCP #371](https://github.com/CursorTouch/Windows-MCP/issues/371), [codex #48145](https://github.com/openai/codex/issues/48145). Codex reported Windows Graphics Capture failures with `FrameArrived timed out` and with `CreateForMonitor 0x80070057` on a hybrid-GPU laptop — [codex #51291](https://github.com/openai/codex/issues/51291), [codex #54690](https://github.com/openai/codex/issues/54690)
- On hybrid-GPU laptops, Windows-MCP's display-filtered screenshots silently returned another monitor's pixels: dxcam enumerates outputs per adapter, but `device_idx` was never supplied. Open — [Windows-MCP #416](https://github.com/CursorTouch/Windows-MCP/issues/416)
- cua's `get_desktop_state` failed with ERROR_INVALID_HANDLE from an unchecked screen DC while the workstation was locked — [cua #4064](https://github.com/trycua/cua/issues/4064)
- Peekaboo's iOS Simulator capture was black through `SCContentFilter(desktopIndependentWindow:)`. A display filter including the window, with `sourceRect`, works, and the proposed fix detects a black image and falls back to it — [Peekaboo #49](https://github.com/steipete/Peekaboo/issues/49)
- Peekaboo `image --app "Google Chrome"` captured a blank untitled helper window. The fix prioritizes titled windows — [Peekaboo #67](https://github.com/steipete/Peekaboo/issues/67). App focus picked an off-screen 1920x30 helper window; the fix ranks the best renderable window — [Peekaboo #802](https://github.com/steipete/Peekaboo/issues/802)
- cua's desktop captures included the driver's own agent cursor and session pill, and OCR then read "Suk nit" instead of "Submit". On macOS, `screencapture -x` also captures an overlay with `NSWindowSharingReadOnly` — [cua #4194](https://github.com/trycua/cua/issues/4194)
- cua streamed a black desktop on GNOME 50 Wayland because it captured the rootless Xwayland `:0` (title of [cua #5236](https://github.com/trycua/cua/issues/5236))

**5. Swift/SCK continuation leaks, capture hangs and cancellation**
- On macOS Tahoe, a Swift continuation leak in the capture path made Peekaboo's `see`, `image` and `permissions` hang — [Peekaboo #52](https://github.com/steipete/Peekaboo/issues/52). `SCScreenshotManager.captureImage` always timed out in window mode — [Peekaboo #128](https://github.com/steipete/Peekaboo/issues/128). A similar leak report in Claude Code turned out to be a Screen Recording grant that took effect only after restarting iTerm — [claude-code #41116](https://github.com/anthropics/claude-code/issues/41116)
- Peekaboo's ScreenCaptureKit transient-denial retry slept with `try? await Task.sleep`, which swallowed cancellation, so a cancelled capture still ran a second attempt. Fixed in v3.9.7 — [Peekaboo #289](https://github.com/steipete/Peekaboo/issues/289)
- In UI-TARS, a paused GUIAgent loop cannot be released by `stop()` or the abort signal, because it checks cancellation only after awaiting the resume promise — [UI-TARS #2021](https://github.com/bytedance/UI-TARS-desktop/issues/2021)
- cua's long-lived macOS process leaks one full-resolution pixel buffer per window screenshot — [cua #4663](https://github.com/trycua/cua/issues/4663)

**6. Focus and wrong-window input**
- Windows-MCP `switch_app()` reported success without comparing `GetForegroundWindow()` to the target, and the foreground lock often refuses the change — [Windows-MCP #419](https://github.com/CursorTouch/Windows-MCP/issues/419)
- Peekaboo `click --app Claude --window-id N --coords` clicked Chrome when the windows overlapped — [Peekaboo #90](https://github.com/steipete/Peekaboo/issues/90)
- cua's app-name window resolution can target the wrong Notepad window, including one with the user's unsaved document — [cua #4327](https://github.com/trycua/cua/issues/4327). cua fixed foreground drags that were sent to a window covering the target — [cua PR #5616](https://github.com/trycua/cua/pull/5616). cua's background Cmd+V pasted into the browser omnibox and exposed a credential during QA; the fix refuses that route — [cua #5121](https://github.com/trycua/cua/issues/5121)
- cua's X11 foreground input reports success while another client holds an active keyboard grab. Open — [cua #5674](https://github.com/trycua/cua/issues/5674)

**7. Disrupting the user's desktop: minimize, restore and system windows**
- On Windows, Claude's computer use minimizes every non-allowlisted window before screenshots and never restores them, which breaks TextInputHost (the emoji and clipboard panel) and the lock screen — [claude-code #102334](https://github.com/anthropics/claude-code/issues/102334). Minimizing five cloaked `Windows.UI.Core.CoreWindow` windows and two `Internet Explorer_Hidden` windows sent TextInputHost into a 97-99% CPU loop — [claude-code #97945](https://github.com/anthropics/claude-code/issues/97945)
- Ending screen control restored windows the user had minimized before the session and gave focus to an unrelated app — [claude-code #91794](https://github.com/anthropics/claude-code/issues/91794). A leaked always-on-top flag made the Claude window stay topmost — [claude-code #95580](https://github.com/anthropics/claude-code/issues/95580)
- Windows-MCP's PowerShell tool flashed a console window that stole keyboard focus on every call. The fix adds `CREATE_NO_WINDOW` — [Windows-MCP #369](https://github.com/CursorTouch/Windows-MCP/issues/369)
- After cancel, a Codex helper kept resetting the Windows idle timer, so the display never slept — [codex #51022](https://github.com/openai/codex/issues/51022)

**8. UIA/AX tree hangs, huge trees and timeouts**
- Windows-MCP's tree walk deadlocked Electron host apps, and Windows killed VS Code as hung. An abandoned Snapshot kept the worker busy for 127.5 s — [Windows-MCP #383](https://github.com/CursorTouch/Windows-MCP/issues/383). Snapshot also hung on a COM threading (STA) deadlock — [Windows-MCP #89](https://github.com/CursorTouch/Windows-MCP/issues/89). UIA returned an empty desktop when called off the event-loop thread — [Windows-MCP #385](https://github.com/CursorTouch/Windows-MCP/issues/385)
- With an Edge `<select>` expanded, Windows-MCP recursed on repeated UIA runtime IDs and logged 38.9 MB of RecursionError — [Windows-MCP #428](https://github.com/CursorTouch/Windows-MCP/issues/428). It retried stale elements after `UIA_E_ELEMENTNOTAVAILABLE` — [Windows-MCP #393](https://github.com/CursorTouch/Windows-MCP/issues/393). Per-character `word` leaves dominate Electron trees — [Windows-MCP #495](https://github.com/CursorTouch/Windows-MCP/issues/495)
- In cua, unbounded synchronous accessibility walks made one click take 33 s on a Tk window — [cua #4213](https://github.com/trycua/cua/issues/4213). Every `get_window_state` paid a 2 s UIA desktop-enumeration deadline, fixed with an exact HWND probe — [cua #4416](https://github.com/trycua/cua/issues/4416). A walk starved by `max_elements` was misreported as `ax_tree_empty` — [cua #3960](https://github.com/trycua/cua/issues/3960)
- cua never drained its AT-SPI bus connection. dbus-broker's per-user quota ran out, `at-spi2-registryd` was dropped, and every Qt app then hung at launch — [cua #4894](https://github.com/trycua/cua/issues/4894)

**9. Subprocess and helper lifecycle**
- Windows-MCP's PowerShell tool hung because grandchildren inherited the stdout/stderr pipe and `communicate()` waited for an EOF that never came. The fix uses temp files and `proc.wait()` on the direct child — [Windows-MCP #146](https://github.com/CursorTouch/Windows-MCP/issues/146)
- uv's `PYTHONHOME` leaked into child PowerShell sessions and broke unrelated Python installs. The fix strips it — [Windows-MCP #350](https://github.com/CursorTouch/Windows-MCP/issues/350). `PATHEXT` stripped to `.CPL` broke executable resolution — [Windows-MCP #88](https://github.com/CursorTouch/Windows-MCP/issues/88). Under MSIX Claude Desktop, AppData writes from the PowerShell tool are silently redirected — [Windows-MCP #488](https://github.com/CursorTouch/Windows-MCP/issues/488)
- Concurrent server starts raced on the shared comtypes generated-module cache and crashed with ImportError — [Windows-MCP #412](https://github.com/CursorTouch/Windows-MCP/issues/412), [Windows-MCP #374](https://github.com/CursorTouch/Windows-MCP/issues/374)
- An indicator render failure left Windows-MCP's controller permanently unavailable — [Windows-MCP #478](https://github.com/CursorTouch/Windows-MCP/issues/478)
- Peekaboo's `NSStatusItem` ghost icons accumulated. The fix keeps one controller and removes the item on teardown — [Peekaboo #129](https://github.com/steipete/Peekaboo/issues/129). Codex left virtual-pointer arrow ghosts on the display (absent from screenshots), and a cursor marker stayed after an explicit stop — [codex #53944](https://github.com/openai/codex/issues/53944), [codex #55540](https://github.com/openai/codex/issues/55540). Claude Code's `/remote-control` forked a computer-use bridge that persisted for days — [claude-code #91143](https://github.com/anthropics/claude-code/issues/91143)

**10. Clipboard paste and restore races**
- Peekaboo's temporary paste restores the previous pasteboard after a fixed 150 ms, without any acknowledgement from the receiver, so a slow receiver can read the restored previous contents. Open — [Peekaboo #1111](https://github.com/steipete/Peekaboo/issues/1111). Background rich paste had no effect in a cold (freshly launched) TextEdit process, even with a 1000 ms restore delay, though it worked in a warm one — [Peekaboo #877](https://github.com/steipete/Peekaboo/issues/877)
- The UI-TARS clipboardy fallback intermittently failed with "Could not paste from clipboard" on Windows 10 — [UI-TARS #1318](https://github.com/bytedance/UI-TARS-desktop/issues/1318)

**11. Permissions (TCC) failures and misattribution**
- Peekaboo's Screen Recording check failed on macOS 26 when spawned by Node.js and passed under Terminal — [Peekaboo #75](https://github.com/steipete/Peekaboo/issues/75). The AppleEvents prompt never appeared until the hardened-runtime entitlement `com.apple.security.automation.apple-events` was added — [Peekaboo #73](https://github.com/steipete/Peekaboo/issues/73). cua's usable permissions depend on who starts the daemon (LaunchServices vs a child process) — [cua #4802](https://github.com/trycua/cua/issues/4802)
- Claude Code's synthetic clicks and keystrokes were silently dropped on macOS while screenshots worked — [claude-code #76918](https://github.com/anthropics/claude-code/issues/76918)

**12. MCP schema and client quirks**
- Claude Desktop sent coordinate arrays as JSON strings and Windows-MCP failed validation; the fix coerces them — [Windows-MCP #272](https://github.com/CursorTouch/Windows-MCP/issues/272), [Windows-MCP #342](https://github.com/CursorTouch/Windows-MCP/issues/342)
- Peekaboo tool schemas declared `oneOf`/`allOf`/`anyOf` at the JSON Schema root, which the Anthropic Messages API rejects — [Peekaboo #708](https://github.com/steipete/Peekaboo/issues/708). MCP `initialize` failed with -32603 when a client sent a non-string `experimental` capability, which broke Codex — [Peekaboo #745](https://github.com/steipete/Peekaboo/issues/745)
- Retina screenshots over 2000 px were rejected by the API path — [claude-code #50530](https://github.com/anthropics/claude-code/issues/50530)

**13. Platform references cited by the mapping**
- `SendInput`: "This function fails when it is blocked by UIPI. Note that neither GetLastError nor the return value will indicate the failure was caused by UIPI blocking" — [Microsoft Learn: SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)
- `MOUSEINPUT`: absolute coordinates map to the primary monitor unless `MOUSEEVENTF_VIRTUALDESK` is set, in which case they map to the whole virtual desktop — [Microsoft Learn: MOUSEINPUT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput)
- node.exe's embedded manifest declares only supportedOS GUIDs, with no `dpiAware` or `dpiAwareness` element, so node.exe runs DPI-unaware — [nodejs/node src/res/node.exe.extra.manifest](https://raw.githubusercontent.com/nodejs/node/main/src/res/node.exe.extra.manifest)
- pbcopy/pbpaste "use locale environment variables to determine the encoding"; "if an encoding cannot be determined from the locale, the standard C encoding will be used" — pbcopy(1) man page on the local macOS (Darwin 25.2) machine (no URL; read with `man pbcopy`)

### Inferences
- The most-repeated root cause across vendors is a press on one path and a release on another (classes 1 and 5). Every vendor's fix moves the release into a guard or `finally`, or clears flags on the final event.
- On Windows, coordinate bugs come down to three choices: DPI awareness of the process, `VIRTUALDESK` normalization, and which API produced the rect (UIA physical vs GDI virtualized). A Node-hosted native addon inherits node.exe's DPI-unaware default unless it opts in, which is exactly cua #3449.
- "Reported success, but the input never landed as intended" is the failure mode the reporters call worst (Windows-MCP #419: "the worst possible failure mode for an agent"; #436 and #441 both report success after corrupt or misplaced input), because the agent carries on confidently. Peekaboo instead returns an explicit `dispatched_unverified` result (#877), a contract computer-use-mcp could adopt.

### Gaps
- Claude Code's and Codex's computer-use implementations are closed source. Their issues give symptoms and sometimes measurements, but no confirmed root cause or fix.
- The microsoft/UFO tracker had almost nothing relevant in 2025-2026 (87 issues total; the closest are a 2025 UWP modal traversal issue, #220, and a `capture_as_image` NoneType, #232), so UFO contributes no classes here.
- Many cua issues are still open, without a merged fix (#3449, #4663, #4894, #5674, #5677). For those, only the root-cause analysis is available.

## Key Question 2: Does computer-use-mcp have the same defects? (mapping with file:line)

### Takeaway
computer-use-mcp already guards many of these classes: Unicode-string typing, surrogate-safe Windows typing and
clipboard, verified Windows activation, MTA UIA with node and depth caps, a per-call SCK helper process with a timeout and
a lock, atomic helper compiles, `windowsHide`, PATH/PATHEXT kept, a status card that watches the server pid and is
excluded from capture, and a pause that refuses rather than parks. The known defects are all still present. The reading
found about twenty siblings. The most serious are:

- Windows mouse normalization reaches only the primary monitor.
- The process is DPI-unaware on Windows.
- `prepare_display` minimizes system windows on Windows, and `unhide_app` restores windows the user had minimized.
- A partially pressed `hold_key` can leak on Windows and Linux.
- Emergency Stop cannot release middle or right buttons (or any button on Linux).
- Chord flags are carried on the macOS key-up.
- A first DXGI capture on a still screen can return a never-written (black) frame.
- A cancelled screenshot falls back to a second capture.
- Clipboard restore is timed and text-only.

### Cited Findings

#### Known defects: are they still present?
- **Windows window capture uses GetDC+BitBlt.** Still present at `native/src/screenshot.rs:1000-1047` (GetDC at 1008, unchecked `BitBlt` at 1016). **Confirmed (read).** Class 4 ([claude-code #103212](https://github.com/anthropics/claude-code/issues/103212)).
- **hold_key and drags are synchronous N-API calls.** Still present. `hold_key` sleeps inside the native call (`native/src/keyboard.rs:783-785` macOS, `1014-1016` Windows, `239-241`/`266-268` Linux), and TS only caps it at `MAX_HOLD_SECONDS = 10` (`src/session/input-handlers.ts:26`, `503-508`). No native function uses `AsyncTask` or a threadsafe function (grep of `native/src/*.rs` finds none), so every native call blocks the Node main thread. **Confirmed (read).**
- **`npx.cmd` is spawned without a shell, and `npm run build` uses POSIX tools.** Still present: `scripts/build-ts.mjs:16` (`execFileSync(... 'npx.cmd' ...)` with no `shell`), and `package.json:142` and `:145` (`cp`, `uname`, `sed`, `codesign`). **Confirmed (read).**
- **Linux `list_windows` returns an empty list when wmctrl is missing.** Still present at `native/src/windows.rs:66-69` (`unwrap_or_else(|_| Command::new("true").output().unwrap())`). **Confirmed (read).** Siblings are listed under class K below.
- **Windows `process_kill list` times out.** `src/session/admin-handlers.ts:218-226` still runs `Get-Process | Sort-Object ...` with a 30 s timeout. **Confirmed (read).** The arm64 runner timing was not checked.
- **Flaky progress test.** `test/progress.test.mjs:28-38` asserts at least one progress notification. The emitting walk (`src/session/admin-handlers.ts:177-191`) is a synchronous `readdirSync` recursion on the main thread. It emits every 25 entries, but the event loop cannot flush or cancel during the walk, so its `signal.aborted` checks cannot become true mid-walk. **Confirmed (read)**; this being the flake's root cause is not established.

#### A. Stuck modifiers and held keys or buttons (class 1)
- **A1: `hold_key` leaks a partial press.**
  - On Windows and Linux X11 the native loop presses keys one by one and returns with `?` on the first unknown name, so the keys already pressed stay down: `native/src/keyboard.rs:1004-1012` (Windows) and `256-264` (X11). The X11 path also skips `XCloseDisplay` at 273, which leaks the X connection.
  - TS accepts `f1`-`f20` on every platform (`src/session/keys.ts:16-22`), but the Windows map has only F1-F12 (`keyboard.rs:830-841`) and the Linux map has F1-F12 and no `fn` (`keyboard.rs:42-53`). So `hold_key ["shift","f13"]` on Windows, or `["ctrl","fn"]` on Linux, passes TS validation and then leaves Shift or Ctrl down. That is the same shape as [Windows-MCP #483](https://github.com/CursorTouch/Windows-MCP/issues/483).
  - Not reachable on macOS, whose map has f1-f20 and fn (`keyboard.rs:327-347`), or on Linux Wayland, which validates every key before pressing (`keyboard.rs:226-237`).
  - **Confirmed (read)**; not executed.
- **A2: macOS chord flags ride on the release event.**
  - `key_press` sets the chord flags on the key-up (`native/src/keyboard.rs:448-449`), and `hold_key` releases each key with its own modifier flag still set (`787-791`). Mouse press, drag and release all carry the modifier flags (`native/src/mouse.rs:533-542`), and the additive click sets Command on the mouse-up (`mouse.rs:634-638`).
  - This is the pre-fix pattern of [Peekaboo #797](https://github.com/steipete/Peekaboo/issues/797), and Peekaboo's fix was to clear the flags on the terminal key-up ([PR #803](https://github.com/openclaw/Peekaboo/pull/803)).
  - **Pattern confirmed (read); effect possible, not reproduced.** Our events come from a `CGEventSourceStateID::Private` source (`keyboard.rs:289-293`), and it is unverified whether that changes the global `NSEvent.modifierFlags` outcome Peekaboo measured.
- **A3: Emergency Stop does not release middle or right buttons, and the latch blocks the release itself.**
  - `post_button_event` calls `ensure_not_emergency_stopped()?` before sending the button-up (`native/src/mouse.rs:934` Windows, `530` macOS, `336` Linux). The latch's release hook releases only the tracked left button (`mouse.rs:951-953`, `545-546`, `669-685`, `1044-1048`). On Linux, `release_agent_held_buttons` is a no-op (`mouse.rs:1096`).
  - The TS drag's `finally` (`src/session/input-handlers.ts:569-572`) therefore cannot release a middle-button (Blender orbit) or right-button drag after Stop, and on Linux it cannot release any button.
  - Related: [cua #4692](https://github.com/trycua/cua/issues/4692) and [cua #5677](https://github.com/trycua/cua/issues/5677).
  - **Confirmed (read)**; not executed.
- **A4: Protected.** Windows `ModifierGuard` and `ControlGuard` release on `Drop`, including early returns (`native/src/mouse.rs:822-832`, `887-925`, `1012-1015`). That covers the `MultiSelect` site of [Windows-MCP #483](https://github.com/CursorTouch/Windows-MCP/issues/483). On X11, `xdotool type --clearmodifiers` (`keyboard.rs:214-216`) protects typing while the user holds a modifier.
- **A5: No permanent latch.** The Windows user-active guard records the timestamp of the last physical event from low-level hooks that ignore injected events (`native/src/activity.rs:482-545`, `236`). It keeps no held-key bookkeeping, so it is immune to the latch class of [Windows-MCP #456](https://github.com/CursorTouch/Windows-MCP/issues/456) and [#474](https://github.com/CursorTouch/Windows-MCP/issues/474). **Confirmed (read).**

#### B. Keyboard layout (class 2)
- **B1: `type` is layout-independent on macOS and Windows.** macOS sends Unicode string events (`native/src/keyboard.rs:474-485`) and Windows uses `KEYEVENTF_UNICODE` (`985-995`), which is the post-fix design of [Peekaboo #330](https://github.com/steipete/Peekaboo/issues/330). On Wayland, `ydotool type` (`keyboard.rs:212`) maps text through a keymap, and its non-US behavior is unverified. **Confirmed (read).**
- **B2: `key` uses US-positional codes for letters and punctuation on macOS and Linux.** macOS uses kVK_ANSI codes (`keyboard.rs:356-405`) and Linux fixed X11 keycodes (`62-108`). Windows uses VK_A-VK_Z for letters, which are layout-mapped, but `VK_OEM_*` for punctuation (`863-873`), which depends on the layout. TS aliases hard-code US shifted positions, for example `'@' → 'shift+2'` and `'"' → "shift+'"` (`src/session/keys.ts:25-48`). On AZERTY or QWERTZ, `key cmd+z` or `key @` should produce a different key. **Code confirmed (read); effect likely, not verified on a non-US layout.**
- **B3: The `type mode:"keys"` layout table is cached for the life of the process.** It is built from the current input source with UCKeyTranslate (`keyboard.rs:549-615`) but held in a `OnceLock` (`689-693`), so switching input source mid-session uses a stale table. Off the main thread it falls back to US-ANSI (`550-553`). **Confirmed (read).**

#### C. Unicode, emoji and encoding (class 2)
- **Protected:**
  - Windows `type` sends each UTF-16 unit, including both surrogate halves (`native/src/keyboard.rs:985-989`), unlike pre-fix [Windows-MCP #436](https://github.com/CursorTouch/Windows-MCP/issues/436).
  - The Windows clipboard buffer is sized from `encode_utf16()` plus a NUL (`native/src/clipboard.rs:155-160`), unlike [Windows-MCP #437](https://github.com/CursorTouch/Windows-MCP/issues/437).
  - Linux AT-SPI writes with `set_text_contents` (`libexec/linux-atspi.py:126`), the route that worked in [cua #4754](https://github.com/trycua/cua/issues/4754).
  - UIA BSTRs are converted with `to_string()` (`native/src/accessibility.rs:191-193`). windows-rs converts BSTR lossily, so emoji should not crash serialization as in [Windows-MCP #382](https://github.com/CursorTouch/Windows-MCP/issues/382). **Likely**; the windows-rs behavior is from memory, not checked.
- **C1: macOS `type` can split a surrogate pair.** It slices UTF-16 into fixed 20-unit chunks (`native/src/keyboard.rs:474-475`) with no boundary check, so an emoji straddling unit 20/21 is sent as two lone surrogates in two events. **Confirmed (read); visible corruption likely.**
- **C2: `run_script` PowerShell output is decoded as UTF-8 without forcing UTF-8 output.**
  - The `run_script` PowerShell path (`src/session/scripting-service.ts:109-125`) never sets `[Console]::OutputEncoding`, although `src/session/application-discovery.ts:77` does for its own call. Windows PowerShell 5.1 then writes the OEM code page into the pipe, and `spawn.ts` decodes UTF-8.
  - `spawn.ts` also decodes each chunk on its own (`src/session/spawn.ts:143`, `153`), so a multibyte character split across chunks becomes U+FFFD.
  - Class of [Windows-MCP #493](https://github.com/CursorTouch/Windows-MCP/issues/493). **Code confirmed (read); mojibake likely on non-UTF-8 Windows locales.**
- **C3: macOS clipboard calls pass no locale.** `pbcopy`/`pbpaste` run without `LANG` (`src/session/input-handlers.ts:515`, `521`, `727-738`). Per the pbcopy(1) man page, they fall back to the C encoding when the locale is unset, so `read_clipboard` and `write_clipboard` mangle non-ASCII when the MCP host omits `LANG`. The paste path checks `pbpaste` against the text and falls back to `typeText` (`730-734`), but restoring the user's saved clipboard can write back mangled text. **Likely, depending on the host environment.**

#### D. Clipboard paste and restore (class 10)
- **D1: The restore is timed, with no acknowledgement.** It runs after a fixed 100 ms (`src/session/input-handlers.ts:715-721` on Windows/Linux, `731-739` on macOS). That is shorter than Peekaboo's 150 ms, which was shown racing a slow receiver ([Peekaboo #1111](https://github.com/steipete/Peekaboo/issues/1111)), and [Peekaboo #877](https://github.com/steipete/Peekaboo/issues/877) shows cold apps need far more. **Confirmed (read).**
- **D2: The restore is text-only.**
  - Windows `read_clipboard` returns `""` when there is no `CF_UNICODETEXT` (`native/src/clipboard.rs:108-125`), and `pbpaste` returns empty for an image or files.
  - The saved `""` is then written back (`input-handlers.ts:718-721`, `735-738`), so a user's copied image or file list is replaced by empty text after any `type` of more than 100 characters or any multi-line `type`.
  - **Confirmed (read).** No competitor issue for exactly this was found.
- **D3: No clipboard-history exclusion.** Text routed through the clipboard is written as plain `CF_UNICODETEXT` only (`native/src/clipboard.rs:155-190`). It sets no `ExcludeClipboardContentFromMonitorProcessing` or `CanIncludeInClipboardHistory` format, and pbcopy marks nothing transient or concealed, so typed text lands in Win+V history and clipboard managers. Related exposure: [cua #5121](https://github.com/trycua/cua/issues/5121). **Confirmed (read)**; the exposure is inferred.
- **D4: Protected.** Restore happens only when the clipboard still holds our text (`input-handlers.ts:720-721`, `738`), which preserves anything the user copied meanwhile. The pid route never pastes (`input-handlers.ts:661`).

#### E. DPI and multi-monitor coordinates (class 3)
- **E1: The Windows process is DPI-unaware.**
  - There is no `SetProcessDpiAwareness(Context)` call anywhere in `native/src`; the only DPI API is `GetDpiForMonitor` at `native/src/display.rs:155`. node.exe's manifest declares no DPI awareness (class 13), so under `npx`/node.exe the addon runs DPI-unaware. That is the exact root cause of [cua #3449](https://github.com/trycua/cua/issues/3449), [#1879](https://github.com/trycua/cua/issues/1879) and [#4804](https://github.com/trycua/cua/issues/4804).
  - UIA bounds are in physical pixels (`native/src/accessibility.rs:195`, `457`), while mouse normalization uses virtualized `SM_CXSCREEN` (`native/src/mouse.rs:834-843`). So label-resolved clicks, which take the UIA bounds centre into `mouseClick` (`src/session/input-handlers.ts:584`, `625`, `744-751`), are off by the scale factor, as in [claude-code #93992](https://github.com/anthropics/claude-code/issues/93992).
  - Window capture combines `GetWindowRect`, which is virtualized for an unaware caller, with the window DC (`screenshot.rs:1000-1016`), so a DPI-aware app's window may be cropped to its upper-left part.
  - **Absence confirmed (read); effects likely at scaling above 100%.** Whether an Electron host such as Claude Desktop is per-monitor aware, which would make behavior depend on the host, is unverified.
- **E2: Windows clicks can only reach the primary monitor.**
  - `to_absolute` normalizes against `SM_CXSCREEN`/`SM_CYSCREEN`, and every send uses `MOUSEEVENTF_ABSOLUTE` without `MOUSEEVENTF_VIRTUALDESK` (`native/src/mouse.rs:834-843`, `942-946`, `981`, `998`, `1071`).
  - Yet TS accepts any point inside any listed display (`src/session/input-handlers.ts:700-708`; `list_displays` enumerates all monitors at `native/src/display.rs:203-222`).
  - A point on a secondary monitor normalizes above 65535 and is clamped to the primary; negative-origin monitors are unreachable. Class of [cua #3613](https://github.com/trycua/cua/issues/3613) and [cua #1981](https://github.com/trycua/cua/issues/1981), and fixed in [Windows-MCP #441](https://github.com/CursorTouch/Windows-MCP/issues/441).
  - **Confirmed (read)**, given the documented MOUSEINPUT semantics.
- **E3: Off-by-one normalization.** `(x * 65535.0) / sw` is truncated (`mouse.rs:840-841`), the formula [Windows-MCP #441](https://github.com/CursorTouch/Windows-MCP/issues/441) measured landing one pixel short. **Confirmed (read).**
- **E4: Windows full-screen capture covers one output.** It duplicates output 0 of the default D3D11 adapter only (`native/src/screenshot.rs:793-815`), and the GDI fallback uses the primary-only `SM_CXSCREEN` (`950-951`). Secondary monitors are never captured. On hybrid-GPU laptops, output 0 of the default adapter may not be the primary display, or `DuplicateOutput` may fail; see [Windows-MCP #416](https://github.com/CursorTouch/Windows-MCP/issues/416) and [codex #54690](https://github.com/openai/codex/issues/54690). **Code confirmed (read); hybrid-GPU effect likely.**
- **E5: Protected on macOS.**
  - The SCK helper takes its scale from `filter.pointPixelScale` and the measured image width (`libexec/macos-agent-helper.swift:94`, `116`), not the unit-ambiguous ratio of [Peekaboo #111](https://github.com/steipete/Peekaboo/issues/111).
  - `desktopIndependentWindow` needs no window-to-display mapping, which avoids [Peekaboo #143](https://github.com/steipete/Peekaboo/issues/143).
  - The overlay origin flips against the primary display height, with tests for displays above the primary (`native/src/overlay.rs:98-127`), unlike [cua #4907](https://github.com/trycua/cua/issues/4907).
  - No coordinate guard treating 0 as missing, the [UI-TARS #1964](https://github.com/bytedance/UI-TARS-desktop/issues/1964) pattern, was found in `src/session/*.ts`.
  - **Confirmed (read).**

#### F. Captures (class 4)
- **F1: The first DXGI capture on a still screen can be black.**
  - The warm-up acquires and releases a frame without copying it into the staging texture (`native/src/screenshot.rs:850-862`).
  - Each capture then tries `AcquireNextFrame(100)` three times (`891-905`) and maps the staging texture whether or not a frame was copied (`909-923`).
  - So the first full-screen capture after init on a desktop where nothing changes reads a staging texture that was never written: black, returned as success. This is a sibling of the known black-capture defect, matching [claude-code #103212](https://github.com/anthropics/claude-code/issues/103212).
  - **Code path confirmed (read); black output likely, needs a repro** (start the server and take a screenshot without touching anything).
- **F2: Unchecked GDI results.** `BitBlt` and `GetDIBits` results are ignored (`screenshot.rs:957`, `1016`, and the `GetDIBits` calls that follow). A locked workstation or the secure desktop therefore yields a silent black image, the class of [cua #4064](https://github.com/trycua/cua/issues/4064). **Confirmed (read).**
- **F3: Cloaked windows look on-screen.** Windows `list_windows` filters invisible and tool windows (`native/src/windows.rs:294-302`) but not DWM-cloaked ones, and reports `isOnScreen` as `!IsIconic` (`332`). Cloaked UWP CoreWindows and windows on other virtual desktops therefore count as on-screen for main-window selection (`src/session/window-select.ts:66-83`). `capture_window` does not refuse an iconic HWND (`screenshot.rs:1000-1007`). **Likely.**
- **F4: No black-frame fallback on macOS.** The helper captures through `SCContentFilter(desktopIndependentWindow:)` (`libexec/macos-agent-helper.swift:91`), the filter that returned black for the iOS Simulator in [Peekaboo #49](https://github.com/steipete/Peekaboo/issues/49), and has no fallback for a black frame. **Likely; not tested against the Simulator.**
- **F5: Linux Wayland captures can be black, and X11 can capture the wrong window.**
  - The Wayland chain falls back to `scrot` through Xwayland (`native/src/screenshot.rs:44-49`), which captures a black rootless root on GNOME and KDE Wayland, as in [cua #5236](https://github.com/trycua/cua/issues/5236).
  - `window_id` is ignored on Wayland (`21`).
  - On X11 with `target_app`, `scrot -u` captures the focused window, which may not be the target (`62-70`).
  - **Code confirmed (read); effects likely.**
- **F6: The agent pointer overlay shows up in captures.** Neither overlay is excluded from capture: the macOS NSPanel at shielding level sets no `sharingType` (`native/src/overlay.rs:128-180`), and the Windows layered topmost window has no `SetWindowDisplayAffinity` (`413-440`). Both will appear in `screencapture` and DXGI full-screen captures, the class of [cua #4194](https://github.com/trycua/cua/issues/4194). The status card is excluded (`libexec/macos-status-card.swift:110`; `libexec/windows-status-card.ps1:69`). **Absence confirmed (read); appearance likely.**
- **F7: Protected against SCK hangs and leaks.** Captures run in a per-call helper process with a 10 s `withSckTimeout` (`libexec/macos-agent-helper.swift:64-71`, `81`, `115`) and a cross-server lock (`src/session/macos-helper.ts:204-237`). That addresses [Peekaboo #52](https://github.com/steipete/Peekaboo/issues/52) and [#128](https://github.com/steipete/Peekaboo/issues/128), and makes the long-lived buffer leak of [cua #4663](https://github.com/trycua/cua/issues/4663) moot. **Confirmed (read).**

#### G. Focus, wrong window and desktop disruption (classes 6 and 7)
- **Protected:**
  - Windows activation uses `AttachThreadInput` and `SetForegroundWindow`, then polls `GetForegroundWindow() == hwnd` and reports `raise_failed` (`native/src/windows.rs:443-475`), unlike [Windows-MCP #419](https://github.com/CursorTouch/Windows-MCP/issues/419).
  - Main-window selection prefers titled, larger, on-screen windows (`src/session/window-select.ts:66-83`), unlike [Peekaboo #67](https://github.com/steipete/Peekaboo/issues/67) and [#802](https://github.com/steipete/Peekaboo/issues/802). It is only partial against [cua #4327](https://github.com/trycua/cua/issues/4327): with two same-app windows it picks the largest titled one, which may be the user's document.
  - The overlay is `WS_EX_TOOLWINDOW` (`native/src/overlay.rs:430-434`), so `list_windows` skips it (`windows.rs:299-301`), as cua's later fix does ([cua PR #5566](https://github.com/trycua/cua/pull/5566)).
- **G1: `prepare_display` on Windows minimizes system windows.**
  - It minimizes every visible, non-iconic top-level window of every process except the target and the keep list (`native/src/apps.rs:634-680`; the callback at `655-676`).
  - There is no filter for cloaked windows, tool or owned windows, or system processes (TextInputHost.exe, explorer.exe, LockApp.exe, ShellExperienceHost, SearchHost).
  - That is the mechanism of [claude-code #102334](https://github.com/anthropics/claude-code/issues/102334) and [#97945](https://github.com/anthropics/claude-code/issues/97945), which minimized cloaked TextInputHost CoreWindows and pinned a CPU core, and probably of the IME breakage in [#97444](https://github.com/anthropics/claude-code/issues/97444).
  - **Code confirmed (read); effect likely.**
- **G2: Restoring un-minimizes the user's own windows.** `prepare_display` returns process names only (`apps.rs:674-676`, `683`), and `unhide_app` restores every iconic window of that process (`apps.rs:729-766`, restore at `752-754`). Windows the user minimized before the session are therefore restored too, as in [claude-code #91794](https://github.com/anthropics/claude-code/issues/91794). **Confirmed (read).**
- **G3: No X11 keyboard-grab check.** Focus verification compares the frontmost app only (`src/session/focus.ts:115-137`), and there is no XGrab check anywhere in `native/src`, so an active keyboard grab sends the keys elsewhere while the call reports success, as in [cua #5674](https://github.com/trycua/cua/issues/5674). **Likely.**
- **G4: UIPI-blocked input is reported as delivered.** No `SendInput` return value is checked (`native/src/keyboard.rs:904`, `993-995`; `native/src/mouse.rs:860`), and input to an elevated window is silently dropped by UIPI (class 13). The tools report success. No competitor issue was found; this is our own finding. **Confirmed (read).**

#### H. Event-loop blocking and tree size (class 8)
- **Protected against runaway trees:** walks are bounded by `NODE_LIMIT = 500` and depth clamps (`native/src/accessibility.rs:226-256`, `341`; `native/src/accessibility_macos.rs:511-513`; `libexec/linux-atspi.py:20`, `81-89`), unlike [Windows-MCP #428](https://github.com/CursorTouch/Windows-MCP/issues/428) and [#495](https://github.com/CursorTouch/Windows-MCP/issues/495).
- **Protected against STA deadlocks:** UIA runs in the MTA (`accessibility.rs:88-93`), unlike [Windows-MCP #89](https://github.com/CursorTouch/Windows-MCP/issues/89) and [#385](https://github.com/CursorTouch/Windows-MCP/issues/385).
- **Protected against a wedged overlay:** the Windows overlay uses `PostMessageW`, so it cannot block the event loop (`native/src/overlay.rs:522-552`; the earlier issue #32 was fixed).
- **H1: Accessibility calls have node limits but no time bound, and they block the main thread.**
  - macOS sets no `AXUIElementSetMessagingTimeout`; grep finds only the node and depth limits at `accessibility_macos.rs:511-513`. Each attribute read against a hung app therefore waits the system AX timeout. cua bounds AX with a messaging timeout ([cua #4082](https://github.com/trycua/cua/issues/4082)), and [cua #4213](https://github.com/trycua/cua/issues/4213) shows 33 s clicks from unbounded walks.
  - Windows `find_element` and `find_first` call `FindAll(TreeScope_Descendants)` over the whole window before truncating the results (`native/src/accessibility.rs:318-321`, `380-383`).
  - Both run synchronously on the Node main thread, so a hung or huge app freezes cancellation and status-card IPC. This is a sibling of the known `hold_key` defect.
  - **Confirmed (read)**; the duration is not measured.
- **H2: filesystem search blocks the loop.** It recurses with `readdirSync` on the main thread (`src/session/admin-handlers.ts:177-191`), so cancellation cannot interrupt it. **Confirmed (read).**

#### I. Subprocess and helper lifecycle (class 9)
- **Protected:**
  - `windowsHide: true` (`src/session/spawn.ts:119`; `src/session/operator-control.ts:376`) prevents the flashing console of [Windows-MCP #369](https://github.com/CursorTouch/Windows-MCP/issues/369).
  - The child environment drops only secrets and the control plane, so PATH and PATHEXT survive (`spawn.ts:42-63`), unlike [Windows-MCP #88](https://github.com/CursorTouch/Windows-MCP/issues/88).
  - Timeouts and aborts kill the process tree (`spawn.ts:74-108`, `164-167`).
  - The Swift helper compile is atomic (unique temporary file, then rename; `src/session/macos-helper.ts:144-153`), unlike the generated-cache race of [Windows-MCP #412](https://github.com/CursorTouch/Windows-MCP/issues/412).
  - The status card exits when the server pid is gone (`libexec/macos-status-card.swift:60-61`, `207-210`; `libexec/windows-status-card.ps1:107-109`), and the pointer overlay lives in-process, unlike the orphaned overlays of [codex #53944](https://github.com/openai/codex/issues/53944) and [#55540](https://github.com/openai/codex/issues/55540).
  - A card failure is non-fatal (`operator-control.ts:358-360`, `377`), unlike [Windows-MCP #478](https://github.com/CursorTouch/Windows-MCP/issues/478).
  - Pause aborts the in-flight call rather than parking it (`operator-control.ts:247-248`), so the hang of [UI-TARS #2021](https://github.com/bytedance/UI-TARS-desktop/issues/2021) cannot occur.
  - The Linux AT-SPI bridge is a per-call process with a 10 s timeout (`src/session/linux-atspi.ts:18`), so the bus-quota failure of [cua #4894](https://github.com/trycua/cua/issues/4894) cannot occur.
- **I1: A grandchild holding stdout delays `run_script` to its timeout.** `run_script` resolves on `'close'` (`src/session/spawn.ts:173`), which waits for every holder of stdout/stderr to close. A background grandchild (for example `bash -c "server &"`, or npm or pip spawning helpers) therefore holds the call until the timeout, which then kills the tree, including what the user meant to leave running. This is [Windows-MCP #146](https://github.com/CursorTouch/Windows-MCP/issues/146) with partial mitigation. **Confirmed (read).**
- **I2: Host-specific variables reach child scripts.** `sanitizedChildEnvironment` passes host variables such as `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `PYTHONHOME` through to scripts (`spawn.ts:52-63`; no stripping found in `src`), the analogue of [Windows-MCP #350](https://github.com/CursorTouch/Windows-MCP/issues/350). Running under the MSIX Claude Desktop also inherits filesystem virtualization, as in [Windows-MCP #488](https://github.com/CursorTouch/Windows-MCP/issues/488). **Likely, depending on the host.**
- **I3: Linux native shell-outs inherit the MCP stdio.**
  - They use `.status()`, which inherits stdin and stdout: `native/src/screenshot.rs:25-85`, `keyboard.rs:144`, `212-216`, `238`, `242`, `mouse.rs:193-257`, `apps.rs:106`, `162`, `177`, `windows.rs:239`, `spaces.rs:68`.
  - The macOS path deliberately uses `.output()` because "on a stdio transport stdout *is* the MCP channel" (`screenshot.rs:479-481`).
  - `xclip` is spawned with stdout inherited (`native/src/clipboard.rs:64-67`) and forks to keep serving the selection, so it can hold the host's pipe open after the server exits.
  - **Confirmed (read)**; corruption happens only if a tool writes to stdout, which is unverified.
- **I4: Cancellation is swallowed by the screenshot fallback.**
  - The SCK helper throws `HelperFailure('aborted')` on abort (`src/session/macos-helper.ts:213`, `266`).
  - `#sckScreenshot` catches every `HelperFailure` and returns `undefined` (`src/session/screenshot-handlers.ts:115-117`), so `handleAsync` falls through to the synchronous native capture (`102`).
  - A cancelled screenshot therefore still runs `screencapture`. This is [Peekaboo #289](https://github.com/steipete/Peekaboo/issues/289)'s class.
  - **Confirmed (read).**
- **I5: Typing stopped mid-way is reported as success.** When the emergency latch is set, native `type_text` returns `Ok` with nothing or part of the text sent (`native/src/keyboard.rs:470-478`, `951-953`, `208-210`), and TS then reports "Typed". **Confirmed (read).**

#### J. Linux tools that fail silently (sibling of the known wmctrl defect)
- `native/src/apps.rs:124-127` uses the same `unwrap_or_else(... Command::new("true"))`, so the app list is empty without wmctrl. Typing ignores the exit status of xdotool and ydotool (`native/src/keyboard.rs:144`, `212-216`, `238`, `242`), so a missing tool means `type` reports success. The ydotool mouse calls (`native/src/mouse.rs:184-247`) and xdotool activation (`apps.rs:160`) are all `let _ =`. **Confirmed (read).**

#### K. Schema and client quirks (class 12)
- **Not coerced:** coordinates are `z.array(z.number()).length(2)` with no preprocessing (`src/registry/definitions.ts:19-21`), so the stringified arrays of [Windows-MCP #272](https://github.com/CursorTouch/Windows-MCP/issues/272) come back as a structured `invalid_arguments` (`src/registry/registry.ts:376-391`), not coerced. **Confirmed (read).**
- **Protected:** no root-level `oneOf`/`anyOf`/`allOf` (grep of `src/tool-catalog.ts` and `src/registry` is empty), unlike [Peekaboo #708](https://github.com/steipete/Peekaboo/issues/708).

#### L. Windows newline handling
- `multi_edit` passes text straight to native `typeText` (`src/session/input-handlers.ts:639`), bypassing the newline-to-paste routing at `451`. The Windows native code sends `\n` as a `KEYEVENTF_UNICODE` 0x0A. Its own comment says newlines become VK_RETURN (`native/src/keyboard.rs:960-962`), but the code does not do that (`979-989`). This matches the multiline corruption of [cua #4477](https://github.com/trycua/cua/issues/4477). **Confirmed (read).**

### Inferences
- The two Windows mouse issues (E2, E3) and DPI-unawareness (E1) together mean Windows coordinate input is reliable only on a single monitor at 100% scaling. That may explain part of the pending Windows validation (#40 in the project memory).
- A2, A3, D2 and I4 are all one shape: a cleanup path that does not run, or runs wrong, on the abnormal path. A small test harness that fires abort or Stop mid-gesture and then checks OS modifier and button state (`$.NSEvent.modifierFlags`, `GetAsyncKeyState`) would cover all four.
- G1 is probably the most user-visible Windows regression risk. Claude Code's own users report the identical mechanism as breaking IME, emoji panel and lock screen.

### Gaps
- No Windows or Linux machine was used, so every Windows/Linux effect above is inferred from code and competitor measurements.
- I could not confirm whether `CGEventSourceStateID::Private` avoids the macOS flag stickiness Peekaboo measured; the JXA probe in Key Question 3 settles it.
- I could not confirm whether the DXGI staging texture is zero-initialized (black) or stale on the first capture (F1). Either is wrong.
- I could not confirm whether an Electron host (Claude Desktop, Cursor) that spawns the server with `ELECTRON_RUN_AS_NODE` makes the process per-monitor DPI aware, which would make E1 host-dependent.
- I did not check whether UIA `BoundingRectangle` is physical for a DPI-unaware client on every Windows build. The claim rests on [claude-code #93992](https://github.com/anthropics/claude-code/issues/93992) and [Windows-MCP #86](https://github.com/CursorTouch/Windows-MCP/issues/86).
- I did not check whether Secure Event Input on macOS hides keystrokes from the user-active guard's event tap. If it does, the guard would miss the user typing in a password field.
- `left_click_drag` (`input-handlers.ts:370-387`) was only skimmed; its `finally` uses `mouseButton('release')`, which hits the same latch check (`native/src/mouse.rs:1028`, `650`).

## Key Question 3: Which competitor fixes are cheap to port?

### Takeaway
About a dozen fixes are a few lines each and close confirmed defects. In priority order: validate-then-press plus a
release guard in `hold_key`; clear flags on the macOS terminal key-up; let the button-up bypass the emergency latch and
track all buttons; use `MOUSEEVENTF_VIRTUALDESK` with rounded virtual-screen normalization; copy the DXGI warm-up frame;
rethrow `aborted` in `#sckScreenshot`; split macOS typing on surrogate boundaries; force UTF-8 PowerShell output; filter
system and cloaked windows and record HWNDs in `prepare_display`. Opting into per-monitor DPI awareness, and switching
window capture to PrintWindow or Windows Graphics Capture, are larger because they change the coordinate contract or the
capture path.

### Cited Findings
1. **`hold_key` release guard (A1).** Resolve every key before pressing any, as the Wayland branch already does (`native/src/keyboard.rs:226-237`), and release in a `Drop` guard. Also add F13-F20 to the Windows map (`VK_F13`..`VK_F20`) and to the Linux map, or make `BASE_KEY_NAMES` platform-aware (`src/session/keys.ts:16-22`). Mirrors the [Windows-MCP #483](https://github.com/CursorTouch/Windows-MCP/issues/483) remedy. Size: under 30 lines.
2. **Clear chord flags on the terminal event (A2).** Set empty flags on the final key-up and mouse-up (`keyboard.rs:448-449`, `787-791`; `mouse.rs:541-542`, `634-638`), as [Peekaboo PR #803](https://github.com/openclaw/Peekaboo/pull/803) did. Port Peekaboo's regression probe from [#797](https://github.com/steipete/Peekaboo/issues/797): after `key shift+tab`, `osascript -l JavaScript -e 'ObjC.import("Cocoa"); $.NSEvent.modifierFlags'` must print 0. Size: a few lines plus one integration test.
3. **Emergency release (A3).** Let release events bypass `ensure_not_emergency_stopped`, track left, right and middle in the held state (`native/src/mouse.rs:819`, `951-953`, `1044-1048`; macOS `545-546`, `669-685`), and implement the Linux `release_agent_held_buttons` (`mouse.rs:1096`). Size: small.
4. **Windows virtual-desktop normalization (E2, E3).** Port the exact formula from [Windows-MCP #441](https://github.com/CursorTouch/Windows-MCP/issues/441): `nx = round((x - SM_XVIRTUALSCREEN) * 65535 / max(SM_CXVIRTUALSCREEN - 1, 1))` with `MOUSEEVENTF_MOVE|ABSOLUTE|VIRTUALDESK`, in `to_absolute` and the send sites (`native/src/mouse.rs:834-843`). cua's negative-X seam tests are a model for unit tests ([cua #1981](https://github.com/trycua/cua/issues/1981)). Size: about 15 lines.
5. **DXGI first frame (F1).** Copy the warm-up frame into staging (`native/src/screenshot.rs:850-862`), or track whether staging was ever written and force a fresh acquire on the first call. Size: 2-5 lines.
6. **GDI result checks (F2).** Check the `BitBlt` and `GetDIBits` returns and fail with a named error instead of a black image (`screenshot.rs:957`, `1016`), as in [cua #4064](https://github.com/trycua/cua/issues/4064)'s requested fix. Size: small.
7. **Cancellation (I4, I5).** In `#sckScreenshot`, rethrow when `error.code === 'aborted'` or `signal?.aborted` (`src/session/screenshot-handlers.ts:116`), per [Peekaboo #289](https://github.com/steipete/Peekaboo/issues/289). Have native `type_text` return an `emergency_stopped` error instead of `Ok` (`keyboard.rs:470-478`, `951-953`). Size: 1-5 lines each.
8. **macOS surrogate-safe chunking (C1).** Chunk on `char` boundaries, at most 20 UTF-16 units per chunk without splitting a pair (`native/src/keyboard.rs:474-475`). Size: about 10 lines.
9. **PowerShell output encoding (C2).** Prepend `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();` in `run_script`, as `src/session/application-discovery.ts:77` already does, and decode with a `StringDecoder` or by concatenating Buffers (`src/session/spawn.ts:143`, `153`). Size: about 5 lines.
10. **`prepare_display` and unhide on Windows (G1, G2).**
    - Skip windows with `DWMWA_CLOAKED`, `WS_EX_TOOLWINDOW` and owned windows, plus a deny list of shell and input processes (TextInputHost, explorer, LockApp, ShellExperienceHost, SearchHost, StartMenuExperienceHost).
    - Return the HWNDs actually minimized, and restore only those (`native/src/apps.rs:655-683`, `750-754`).
    - Addresses the mechanism of [claude-code #102334](https://github.com/anthropics/claude-code/issues/102334), [#97945](https://github.com/anthropics/claude-code/issues/97945) and [#91794](https://github.com/anthropics/claude-code/issues/91794).
    - Size: moderate (about 40 lines plus a TS signature change).
11. **`run_script` waits on the direct child (I1).** Resolve on `'exit'` plus a short grace period for stream drain, then destroy the streams, instead of waiting for `'close'` (`src/session/spawn.ts:173`). This is the [Windows-MCP #146](https://github.com/CursorTouch/Windows-MCP/issues/146) remedy in Node terms. Size: small, but it changes behavior for scripts that background work.
12. **Linux shell-out hygiene (I3, J).** Replace `.status()` with `.output()` or `Stdio::null()`, give xclip `stdout(Stdio::null())`, and turn a missing tool into a named error instead of an empty result or a silent success (`native/src/windows.rs:66-69`, `apps.rs:124-127`, `keyboard.rs:144-242`, `screenshot.rs:25-85`). Size: mechanical.
13. **macOS clipboard locale (C3).** Pass `env: { ...process.env, LANG: 'en_US.UTF-8' }` to pbcopy/pbpaste (`src/session/input-handlers.ts:515`, `521`, `727-738`), per the pbcopy(1) man page. Size: 1 line per call.
14. **Overlay capture exclusion (F6).** `setSharingType: 0` (none) on the macOS NSPanel and `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` on the Windows overlay, as the status card already does (`libexec/macos-status-card.swift:110`, `libexec/windows-status-card.ps1:69`). Per [cua #4194](https://github.com/trycua/cua/issues/4194). Size: 2 lines.
15. **Coordinate coercion (K).** A `z.preprocess` that `JSON.parse`s a string into an array for `numArray`/`intArray` (`src/registry/definitions.ts:19-20`), as in [Windows-MCP #272](https://github.com/CursorTouch/Windows-MCP/issues/272). Size: 5 lines.
16. **macOS AX messaging timeout (H1).** Call `AXUIElementSetMessagingTimeout` on the application element before walks, as cua does ([cua #4082](https://github.com/trycua/cua/issues/4082)), and add a wall-clock budget to `build_node` (`native/src/accessibility_macos.rs:576-610`). Size: small.

**Larger items** (they change the coordinate contract or the capture path):
- **Per-monitor DPI awareness (E1).** Call `SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)` at addon load. Then make display, window-rect, capture and mouse all physical, or all logical, in one pass. This is the fix cua shipped as a manifest ([cua #1879](https://github.com/trycua/cua/issues/1879)) and proposed for the Node SDK ([cua #3449](https://github.com/trycua/cua/issues/3449)); [claude-code #93992](https://github.com/anthropics/claude-code/issues/93992) recommends the same.
- **Window capture (known defect).** Move to PrintWindow with `PW_RENDERFULLCONTENT`, or to Windows Graphics Capture with a GDI fallback. Windows Graphics Capture has its own failure modes on VMs/RDP and Windows 10 ([codex #48145](https://github.com/openai/codex/issues/48145), [codex #51291](https://github.com/openai/codex/issues/51291), [Windows-MCP #371](https://github.com/CursorTouch/Windows-MCP/issues/371)), so keep a fallback chain and a black-frame check, as Peekaboo proposed for SCK ([Peekaboo #49](https://github.com/steipete/Peekaboo/issues/49)).
- **Multi-output capture (E4).** Enumerate all adapters and outputs, and pick the output by monitor rect, not index 0. That avoids the hybrid-GPU wrong-monitor failure of [Windows-MCP #416](https://github.com/CursorTouch/Windows-MCP/issues/416).
- **Layout-aware `key` on macOS and Linux (B2).** Reuse the existing UCKeyTranslate reverse table (`native/src/keyboard.rs:549-615`) to find the keycode that produces a letter or punctuation character, and use `XKeysymToKeycode` on X11. Peekaboo deliberately kept physical keycodes for hotkeys ([Peekaboo #330](https://github.com/steipete/Peekaboo/issues/330)), so decide the hotkey semantics explicitly before porting.
- **Clipboard restore (D1-D3).** Restore all pasteboard types or refuse the paste route when the clipboard holds non-text, lengthen or verify the restore wait, and mark the content transient or concealed. Peekaboo has no settled fix for the timing part; its #1111 is open ([Peekaboo #1111](https://github.com/steipete/Peekaboo/issues/1111)).

### Inferences
- Items 1-9, 13, 14 and 15 are each under about 30 lines and close confirmed (read) defects. Together they are one small PR per platform layer: native keyboard and mouse, native capture, TS session.
- The DPI and window-capture changes interact: making the process PMv2-aware changes what `GetWindowRect` and `SM_CXSCREEN` return. They belong in one change, together with the `VIRTUALDESK` normalization, and need a Windows test at 150% with two monitors.

### Gaps
- Size estimates come from reading only; nothing was compiled.
- Whether item 11 breaks existing `run_script` users who rely on waiting for background output is unknown.
- No competitor fix was found for the timed clipboard restore (Peekaboo #1111 is open), so there is no proven pattern to port for D1.
