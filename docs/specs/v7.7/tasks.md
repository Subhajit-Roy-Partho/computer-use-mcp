# v7.7.0: tasks

From [`docs/reviews/2026-10-23-competitor-study.md`](../../reviews/2026-10-23-competitor-study.md): the 7.6.2 order
(confirmed defects) and the 7.7 order (the field's contracts). 7.6.2 was never released, so 7.7.0 carries both. James's
ask on 2026-10-24: "implement 7.7 end to end fully and completely".

Each task is marked when its change is in the tree **and** its test passes; "tested by" names the test. Windows and
Linux behaviour is checked by `cargo check` for those targets locally and by CI on real runners; anything that needs
hardware this project does not have (two monitors at 150 %, a Wayland session) says so.

Status: `todo` → `in progress` → `done` (change + test green) → `blocked` / `needs hardware`.

## R. Release pipeline and repository hygiene (7.6.2 order 1–3, 11)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| R1 | Main green: Windows `process_kill list` reads `tasklist` instead of a cold PowerShell `Get-Process` | done | `admin-handlers.ts` `parseTasklistCsv` | session-admin-handlers |
| R2 | Native staging skips when the main version is already on npm | done | `stage-platform-packages.mjs` main-version check | platform-stage (2 new) |
| R3 | Native staging warns (not fails) on a published-integrity mismatch; "already staged" tolerated for natives and main, as 7.6.1 promised; release-stage tests run on every OS; a main push never cancels a stage in flight | done | `stage-platform-packages.mjs` `alreadyStaged`, mismatch warning; `ci.yml` main step E409 tolerance, `cancel-in-progress` false on main; `NATIVE-PACKAGES.md` | platform-stage (11), release-stage (3, macOS and Linux) |
| R4 | Build portability: `build-ts` runs tsc through Node (no `npx.cmd`); `npm run build` uses a portable `scripts/build-native.mjs`; Windows CI runs `npm run build:ts` | done | `scripts/build-ts.mjs` `tscCommand`; `scripts/build-native.mjs`; `package.json` scripts; `ci.yml` test job | build-scripts (3); CI `npm run build:ts` on five runners |
| R5 | Tool counts derived from the catalog and checked against the docs (drift test); counts corrected | todo | | |

## C. Every stopped or cancelled gesture releases what it pressed (7.6.2 order 4–7)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| C1 | Releases bypass the stop latch; all three buttons tracked; the latch releases every held button and key; Linux release implemented | done | `mouse.rs` `AGENT_BUTTONS_HELD` on macOS, Windows, Linux, releases skip the latch; `keyboard.rs` held-key registry; `activity.rs` latch releases buttons and keys | cargo check (3 targets); Rust unit tests; CI runners |
| C2 | `hold_key` validates every key before pressing any; a guard releases on every exit; F13–F20 on Windows and Linux | done | `keyboard.rs` `resolve_keys`, `key_down`/`key_up` on all platforms; native `hold_key` releases on every exit; F13–F20 on Windows and Linux | v7.7-stop-cleanup; cargo check (3 targets) |
| C3 | macOS chords: the final key-up and mouse-up carry no modifier flags | done | `keyboard.rs` final key-up and `type_keys` key-ups carry no flags; `mouse.rs` release and last additive click carry no flags | cargo check; live check in V3 |
| C4 | `type` reports an error when the latch stopped it part-way (all platforms) | done | `keyboard.rs` `type_text` errors when latched (macOS says how far it got) | cargo check (3 targets) |
| C5 | macOS `type` chunks on character boundaries (no split surrogate pairs) | done | `keyboard.rs` `utf16_chunks` | Rust keyboard::tests (2) |
| C6 | `hold_key` off the event loop: native press/release primitives, the hold awaited in TypeScript, release in `finally` | done | native `keyDown`/`keyUp`; `input-handlers.ts` hold awaited with `sleepAbortable`, `keyUp` in `finally` | v7.7-stop-cleanup (4) |
| C7 | A cancelled screenshot rethrows instead of falling through to a second capture | done | `screenshot-handlers.ts` `abortError`: no fallback capture after a cancel | session-screenshot-handlers (2 new) |

## W. Windows truth (7.6.2 order 7)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| W1 | Absolute input normalised over the virtual desktop (`MOUSEEVENTF_VIRTUALDESK`), rounded | done | `mouse.rs` `normalize_absolute`, `MOUSEEVENTF_VIRTUALDESK` | Rust mouse::tests (3) |
| W2 | `SendInput` counts checked; blocked input (UIPI) is a typed refusal, not success | done | `keyboard.rs` `send_inputs`: fewer events inserted than sent is `input_blocked` | cargo check (Windows); CI |
| W3 | DXGI warm-up frame copied; GDI `BitBlt`/`GetDIBits` results checked | done | `capture_win.rs`: the first duplicated frame is copied before any map; every `BitBlt` and `GetDIBits` result checked | cargo check (Windows); Rust capture_win tests on CI |
| W4 | `prepare_display` skips cloaked, tool, owned and shell/input windows; restores exactly the windows it minimised | done | `win_util.rs` `is_app_window`; `apps.rs` records the windows it minimised and `unhide_app` restores exactly those, without activating | cargo check (Windows); CI; hardware check before tagging |
| W5 | `multi_edit` newlines as Enter, not Unicode 0x0A | done | `keyboard.rs` Windows `type_text`: `\n` as VK_RETURN, `\r` skipped | cargo check (Windows); CI |
| W6 | PowerShell output forced to UTF-8; output decoded across chunk boundaries | done | `scripting-service.ts` `POWERSHELL_UTF8_PREFIX`, every Windows script encoded; `spawn.ts` `StringDecoder` per stream | session-scripting-service; v7.7-spawn |
| W7 | UI Automation through `CUIAutomation8` with 2 s connection and 5 s transaction timeouts | todo | | |
| W8 | The user-active guard ignores zero-delta mouse moves | done | `activity.rs`: zero-length moves are not activity (Windows hook, macOS tap, Linux XI2) | cargo check (3 targets) |

## M. macOS and Linux hygiene (7.6.2 order 8–10)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| M1 | AX messaging timeout on every tree walk | done | `accessibility_macos.rs`: 0.5 s messaging timeout on every element a walk reaches (app, windows, children, menu bar); 5 s budget per walk, `timedOut` on a tree, `ax_timeout` on an empty find | cargo check; v7.7-off-thread (walk off-thread) |
| M2 | The activity tap is re-enabled after the system disables it | done | `activity.rs` re-enables the tap on `kCGEventTapDisabledByTimeout` / `ByUserInput` | cargo check; live run in V3 |
| M3 | `pbcopy`/`pbpaste` run with a UTF-8 locale | done | `input-handlers.ts` `utf8Env` on every `pbcopy`/`pbpaste`; doctor clipboard check | suite |
| M4 | The agent pointer overlay is excluded from screen capture (macOS `sharingType`, Windows display affinity) | todo | | |
| M5 | The capture helper honours `--region`; `wait_for_stable` reports `regionApplied: true` | todo | | |
| M6 | macOS 27's "Device Control and Data Access" named beside "Accessibility" | todo | | |
| L1 | Linux shell-outs never inherit the MCP stdout | in progress | `linux_tools.rs`; mouse, keyboard, clipboard (`wl-copy`, `xclip` with null stdio). Screenshot, windows and apps next | cargo check (Linux); Rust linux_tools tests on CI |
| L2 | A missing Linux tool (`xdotool`, `ydotool`, `wmctrl`, `xclip`, `scrot`) is a named error | todo | | |
| L3 | Linux honours JPEG quality | todo | | |
| A1 | Stringified coordinate arrays (`"[100,200]"`) are coerced | todo | | |

## K. The 7.7 contracts (the study's 7.7 order)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| K1 | Result contract at dispatch: `effect`, `route`, `delivery` on every action; `hint` and a safe `next_call` on every refusal and unverified result, from one table; `verify: true` on input tools; instructions describe it | done | `session/contract.ts`: one refusal table (hint ≤ 240, read-only `next_call` callable in the profile); `applyContract` at dispatch; handlers report pid outcomes, activations, `set_value` and clipboard read-backs; `verify: true`; `element_not_found`; instructions and skill | v7.7-contract (8) |
| K2 | `run_steps` in `desktop`: validate first, activate once, capped waits, stop at the first failure, optional final capture; click aliases listed only in `full` (still callable everywhere); OpenAI adapter scaling fixed | done | `run_steps` (registry-validated steps, focus once, stop at first failure, capture); aliases `listedFrom: full`, `tools/list` wrapped; `openai_computer` maps coordinates through the last screenshot | v7.7-run-steps (7); v6.2-modernization (alias callable in core) |
| K3 | An unchanged capture returns text, not the image, with a streak cap | done | `screenshot-handlers.ts` `#unchangedReply`, `UNCHANGED_TEXT_REPEATS = 3`; `screenshot.resend` | session (dedup); session-screenshot-handlers (streak cap) |
| K4 | Slow natives (accessibility walks, activation, captures) run off the event loop; the card is watched, not only polled; Stop latency under 50 ms, tested | done | `operator-control.ts` watches `control.txt` (Stop under 50 ms); `async_task.rs` runs accessibility walks, finds, menu bars and captures (and activation on Windows and Linux) on a libuv worker with an autorelease pool on macOS; `native-async.ts` `offThread` prefers them; capture measured at 351 ms with the event loop free (the sync call held it 369 ms) | v7.7-person-control (stop latency); v7.7-off-thread (5, one against the built addon); async_task Rust tests |
| K5 | A person's control by default: card on by default on macOS; emergency chord armed by default with modifier reconciliation; takeover on deliberate physical input; `screen_locked` and a display-awake assertion; Windows "locked" and "session disconnected" | in progress | card default on (macOS); chord armed by default with Windows modifier reconciliation; takeover counters and pause/resume; `screen_locked`, `session_disconnected`, `secure_desktop`; display awake; cards show takeover and the chord | v7.7-person-control (5) |
| K6 | Windows geometry and capture: per-monitor DPI v2 awareness and one coordinate contract; window capture `PrintWindow` → Windows.Graphics.Capture → crop with an occlusion flag → refusal for minimised; every output; HWND-precise restore | in progress | `dpi.rs` per-monitor v2; `display.rs` physical coordinates, primary first; `windows.rs` visible bounds, cloaked; `capture_win.rs` ladder and every monitor; `screenshot-handlers.ts` exact mapping, `display_id` | cargo check (Windows); session-screenshot-handlers; hardware check pending |
| K7 | Wayland foundations: portal and GNOME Shell screenshots; a window list that does not need `Shell.Eval`; backends named in `doctor`; a libei design note | todo | | |
| K8 | macOS capture speed: ScreenCaptureKit display capture replaces `screencapture` + `sips`; `wait_for_text` polls with fast OCR and confirms with accurate; autorelease pools | todo | | |
| K9 | Carried over: clipboard guard for non-text contents; `run_script` completes on exit plus a grace period; `scrape` refuses private hosts; filesystem search is async and cancellable | done | `clipboard.rs` `clipboard_has_non_text` (macOS, Windows, Linux) and `type` types instead of pasting over it; `spawn.ts` `EXIT_GRACE_MS`; `url-guard.ts` public addresses only, each redirect checked; `admin-handlers.ts` async, cancellable search | session-input-handlers; v7.7-spawn; session-admin-handlers (3 new); progress (no longer flaky) |
| K10 | Found while fixing a flaky test: the read-only modes of `filesystem`, `registry` and `process_kill` took the cross-process desktop lock, so a search failed with `locked_by_pid` while another server typed, and the person's pause refused it | done | `tool-catalog.ts` `callMutates`; the lock, the pause and Stop gates, the result contract and the desktop broker use it; approval policy still names the tool | v7.7-read-modes (3); progress (the flake) |

## V. Release

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| V1 | Version 7.7.0 everywhere; CHANGELOG; `docs/releases/v7.7.0.md`; AGENTS, README, skills, manifest | todo | | |
| V2 | Draft PR; CI green on all five test runners and six native builds | todo | | |
| V3 | Live macOS integration run (status card, Stop during a hold, takeover) | todo | | |
