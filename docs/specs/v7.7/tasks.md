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
| C1 | Releases bypass the stop latch; all three buttons tracked; the latch releases every held button and key; Linux release implemented | todo | | |
| C2 | `hold_key` validates every key before pressing any; a guard releases on every exit; F13–F20 on Windows and Linux | todo | | |
| C3 | macOS chords: the final key-up and mouse-up carry no modifier flags | todo | | |
| C4 | `type` reports an error when the latch stopped it part-way (all platforms) | todo | | |
| C5 | macOS `type` chunks on character boundaries (no split surrogate pairs) | todo | | |
| C6 | `hold_key` off the event loop: native press/release primitives, the hold awaited in TypeScript, release in `finally` | todo | | |
| C7 | A cancelled screenshot rethrows instead of falling through to a second capture | todo | | |

## W. Windows truth (7.6.2 order 7)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| W1 | Absolute input normalised over the virtual desktop (`MOUSEEVENTF_VIRTUALDESK`), rounded | todo | | |
| W2 | `SendInput` counts checked; blocked input (UIPI) is a typed refusal, not success | todo | | |
| W3 | DXGI warm-up frame copied; GDI `BitBlt`/`GetDIBits` results checked | todo | | |
| W4 | `prepare_display` skips cloaked, tool, owned and shell/input windows; restores exactly the windows it minimised | todo | | |
| W5 | `multi_edit` newlines as Enter, not Unicode 0x0A | todo | | |
| W6 | PowerShell output forced to UTF-8; output decoded across chunk boundaries | todo | | |
| W7 | UI Automation through `CUIAutomation8` with 2 s connection and 5 s transaction timeouts | todo | | |
| W8 | The user-active guard ignores zero-delta mouse moves | todo | | |

## M. macOS and Linux hygiene (7.6.2 order 8–10)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| M1 | AX messaging timeout on every tree walk | todo | | |
| M2 | The activity tap is re-enabled after the system disables it | todo | | |
| M3 | `pbcopy`/`pbpaste` run with a UTF-8 locale | todo | | |
| M4 | The agent pointer overlay is excluded from screen capture (macOS `sharingType`, Windows display affinity) | todo | | |
| M5 | The capture helper honours `--region`; `wait_for_stable` reports `regionApplied: true` | todo | | |
| M6 | macOS 27's "Device Control and Data Access" named beside "Accessibility" | todo | | |
| L1 | Linux shell-outs never inherit the MCP stdout | todo | | |
| L2 | A missing Linux tool (`xdotool`, `ydotool`, `wmctrl`, `xclip`, `scrot`) is a named error | todo | | |
| L3 | Linux honours JPEG quality | todo | | |
| A1 | Stringified coordinate arrays (`"[100,200]"`) are coerced | todo | | |

## K. The 7.7 contracts (the study's 7.7 order)

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| K1 | Result contract at dispatch: `effect`, `route`, `delivery` on every action; `hint` and a safe `next_call` on every refusal and unverified result, from one table; `verify: true` on input tools; instructions describe it | todo | | |
| K2 | `run_steps` in `desktop`: validate first, activate once, capped waits, stop at the first failure, optional final capture; click aliases listed only in `full` (still callable everywhere); OpenAI adapter scaling fixed | todo | | |
| K3 | An unchanged capture returns text, not the image, with a streak cap | todo | | |
| K4 | Slow natives (accessibility walks, activation, captures) run off the event loop; the card is watched, not only polled; Stop latency under 50 ms, tested | todo | | |
| K5 | A person's control by default: card on by default on macOS; emergency chord armed by default with modifier reconciliation; takeover on deliberate physical input; `screen_locked` and a display-awake assertion; Windows "locked" and "session disconnected" | todo | | |
| K6 | Windows geometry and capture: per-monitor DPI v2 awareness and one coordinate contract; window capture `PrintWindow` → Windows.Graphics.Capture → crop with an occlusion flag → refusal for minimised; every output; HWND-precise restore | todo | | |
| K7 | Wayland foundations: portal and GNOME Shell screenshots; a window list that does not need `Shell.Eval`; backends named in `doctor`; a libei design note | todo | | |
| K8 | macOS capture speed: ScreenCaptureKit display capture replaces `screencapture` + `sips`; `wait_for_text` polls with fast OCR and confirms with accurate; autorelease pools | todo | | |
| K9 | Carried over: clipboard guard for non-text contents; `run_script` completes on exit plus a grace period; `scrape` refuses private hosts; filesystem search is async and cancellable | todo | | |

## V. Release

| # | Task | Status | Change | Tested by |
|---|---|---|---|---|
| V1 | Version 7.7.0 everywhere; CHANGELOG; `docs/releases/v7.7.0.md`; AGENTS, README, skills, manifest | todo | | |
| V2 | Draft PR; CI green on all five test runners and six native builds | todo | | |
| V3 | Live macOS integration run (status card, Stop during a hold, takeover) | todo | | |
