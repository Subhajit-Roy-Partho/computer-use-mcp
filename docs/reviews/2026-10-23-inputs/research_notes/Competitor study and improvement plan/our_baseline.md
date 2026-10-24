# computer-use-mcp baseline: 7.6.1 plus #44 (main at 1d054b4), from the code

Scope: what this server does today, how fast and how large it is, how it is tested, and which known defects are still
in the code. It is the baseline for a competitor comparison. Every citation is `path:line` at commit `1d054b4`, linked to
`https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/<path>#L<line>`. Measurements were taken on 2026-10-23 on
this Mac (macOS 26.2, Darwin 25.2.0, Node v25.4.0, darwin-arm64 addon in the tree). Nothing was run that moves the
pointer, types, clicks, activates apps or captures the screen. The measurement methods:

- **M1 (tools/list):** `createComputerUseServer({ session: { dispatch: throws }, platform, profile })` served over
  `InMemoryTransport` to a plain `@modelcontextprotocol/client` `Client`, then `listTools()`. I report the UTF-8 bytes of
  `JSON.stringify(tools)`. This is the method `test/v7.6-tool-surface.test.mjs:14-31` uses, and the host receives the
  same list. It excludes the JSON-RPC envelope. Other platforms go through the `platform` test seam
  ([src/server.ts:122-123](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/server.ts#L122)).
- **M2:** `npm run measure:efficiency`
  ([scripts/measure-efficiency.mjs](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/scripts/measure-efficiency.mjs#L1)).
  It goes through the `connectInProcess` wrapper and measures only the core, scripting, ax and full profiles.
- **M3 (Swift helper):** the cached helper `~/Library/Caches/computer-use-mcp/macos-agent-helper-3aae5b4d`, whose sha8
  matches the current `libexec/macos-agent-helper.swift`, run with `execFileSync`: `version` 15 times, then
  `ocr --image <repo PNG>` 5 times per image, in accurate and `--fast` mode. No screen capture.
- **M4 (image payload):** three UI screenshots committed to the repo, put through the same `sips` steps the macOS native
  screenshot path uses (JPEG, then `sips --resampleWidth 1024`, then `sips --setProperty formatOptions 80`), with each
  step timed.
- **M5 (per-call overhead):** a real session (native addon loaded, `desktop` profile, `COMPUTER_USE_AUDIT_LOG=false`)
  over the in-memory transport. Only read-only meta tools, 200 calls each.
- **M6 (tests):** a local `npm test`, and the CI run for 1d054b4 read with `gh run view 38345976977`.

## Q1. Features: catalog by profile and platform, delivery, capture, OCR, waits, target, operator control, run console, browser, policy, agent_pointer

### Takeaway
The catalog has 79 tools across 8 jobs. On macOS the default `desktop` profile lists **41 tools (measured)**; the docs
say 40. On Windows and Linux it lists 37. macOS is clearly the most capable platform: ScreenCaptureKit window capture,
Vision OCR with text waits and stability waits, background input to a process (`delivery: "pid"`) that verifies itself,
a user-active guard that is on by default, and a status card. Windows and Linux get HID input, screen capture through
native code or shell tools, UIA or AT-SPI, and scripting. They have no OCR and no pid delivery, and the guard is off
unless configured. Linux also has no status card and no Spaces. There is no general action-batching tool in the default
profile.

### Cited Findings

**Catalog, jobs, profiles**
- `TOOL_CATALOG` defines 79 tools. The source comment reads "79 in 7.6.1 with control_status" — [src/tool-catalog.ts:132-221](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L132)
- Tools per job: meta 9, observe 17, act 27, semantic 9, script 2, admin 4, browser 5, spaces 6 — [src/tool-catalog.ts:224-236](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L224) (counted under M1)
- Profiles nest: `core ⊆ desktop ⊆ {ax, scripting ⊆ windows-admin} ⊆ full`. The default is `desktop` — [src/tool-catalog.ts:59-91](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L59)
- Some tools exist on only some platforms: `registry` and `notification` on win32; `read_window_text`, `click_text`, `wait_for_text` and `wait_for_stable` on darwin; the six Spaces tools on darwin and win32. A tool that does not exist on the running platform is neither listed nor callable — [src/tool-catalog.ts:237-263](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L237)
- **Measured tool counts (M1)**, for macOS / Windows / Linux:
  - core 38 / 36 / 36
  - **desktop 41 / 37 / 37**
  - scripting 44 / 40 / 40
  - windows-admin 51 / 49 / 41
  - ax 58 / 54 / 54
  - full 77 / 75 / 67
  - with `runConsole: true`, the run tools add 8 (macOS desktop 49, full 85)
- On macOS, `desktop` adds three tools to `core`: `agent_pointer`, `wait_for_text` and `wait_for_stable` (M1). It also keeps `unhide_app` in core — [src/tool-catalog.ts:136, 168-169, 215-216](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L136)
- **Doc drift on counts:**
  - The docs say the default macOS list is 40 tools, and 36 on Windows and Linux — [AGENTS.md:17](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L17), [CHANGELOG.md:25](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/CHANGELOG.md#L25), [README.md:145](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/README.md#L145), [docs/releases/v7.6.1.md:30](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L30)
  - The same release note says the default list grows by two tools (`unhide_app` and `control_status`) from 7.6.0's 39, which gives 41 — [docs/releases/v7.6.1.md:53](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L53)
  - Measured: 41 on macOS, 37 on Windows and Linux.

**Feature matrix**

| Capability | macOS | Windows | Linux | Tier | Evidence |
|---|---|---|---|---|---|
| Full-screen capture | `screencapture -x -t jpg`, then `sips` resample and quality (three synchronous child processes) | DXGI duplication of output 0 (primary), GDI `BitBlt` fallback | Shells out to gnome-screenshot, grim or scrot (Wayland); import or scrot (X11); Lanczos3 resize | core | [native/src/screenshot.rs:450-505](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L450), [:789-997](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L789), [:13-147](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L13) |
| Window capture | ScreenCaptureKit through the Swift helper (macOS 14+): the window alone, no shadow, works when covered, never activates; falls back to `screencapture -l` | `GetDC(hwnd)` + `BitBlt` | `import -window` / scrot | core | [src/session/screenshot-handlers.ts:89-142](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/screenshot-handlers.ts#L89), [libexec/macos-agent-helper.swift:95-116](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/libexec/macos-agent-helper.swift#L95), [native/src/screenshot.rs:1000-1046](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L1000), [:52-87](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L52) |
| `zoom` | Window region cropped from a full-resolution SCK capture (PNG by default) | Screen crop | Screen crop (`cropImage`) | core | [src/session/screenshot-handlers.ts:151-183](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/screenshot-handlers.ts#L151) |
| OCR: `read_window_text`, `click_text` | Apple Vision on device; accurate unless `fast: true`; regions; covered windows | not listed | not listed | core | [src/session/agent-desktop-handlers.ts:198](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/agent-desktop-handlers.ts#L198), [src/registry/definitions.ts:344-348](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/registry/definitions.ts#L344) |
| Waits | `wait_for_window`, `wait_for_text` (OCR), `wait_for_stable` (SCK hash), `wait` | `wait_for_window`, `wait` | `wait_for_window`, `wait` | core / desktop | [src/session/agent-desktop-handlers.ts:22-30](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/agent-desktop-handlers.ts#L22) |
| HID input (focus, then global events) | CGEvent | `SendInput` (primary monitor scaling) | XTest, or ydotool on Wayland | core | [native/src/mouse.rs:585-646](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L585), [:828-860](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L828), [:35-70](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L35) |
| Background input `delivery: "pid"` (no activation, no cursor move) | `CGEventPostToPid` for key, type, clicks, scroll, click_text. `auto` switches to pid only for apps recorded as `changed` | refused (`pid_delivery_unsupported`) | refused | core | [src/session/input-handlers.ts:111-163](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L111), [src/session/pid-delivery.ts:1-14](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/pid-delivery.ts#L1) |
| User-active guard | On, 4,000 ms (passive HID event tap; needs Input Monitoring) | only when `COMPUTER_USE_USER_IDLE_MS` is set | only when set | all | [src/session/user-activity.ts:19](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/user-activity.ts#L19), [AGENTS.md:146](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L146) |
| Accessibility / semantic | AX tree (depth 10 by default, 20 max), find/click/set_value/menus/fill_form | UIA | AT-SPI through a Python bridge (issue #21: empty trees) | ax (except `get_app_capabilities`) | [native/src/accessibility_macos.rs:511-512, 787-790](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/accessibility_macos.rs#L511), [libexec/linux-atspi.py](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/libexec/linux-atspi.py#L1) |
| Scripting | AppleScript / JXA | PowerShell | bash / pwsh | scripting | [src/session/scripting-service.ts:84-134](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/scripting-service.ts#L84) |
| Session target (`set_target`/`get_target`) | yes | yes | yes | core | [src/registry/definitions.ts:388](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/registry/definitions.ts#L388) |
| Status card + Pause/Resume/Stop (opt-in) | Swift `NSPanel` | PowerShell / WPF, never run on a Windows desktop | state machine and `control_status` only, no card | core (`control_status`) | [src/session/operator-control.ts:348-394](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L348), [docs/releases/v7.6.1.md:57-58](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L57) |
| Native emergency-stop latch | yes | yes | yes (no chord on every backend) | n/a | [native/src/activity.rs:72-109](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/activity.rs#L72) |
| `agent_pointer` (virtual pointer + overlay) | yes | yes (#32: overlay deadlock report still open) | yes | desktop | [src/registry/definitions.ts:80-84](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/registry/definitions.ts#L80), [src/session/virtual-pointer.ts:19-110](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/virtual-pointer.ts#L19) |
| Spaces / virtual desktops | read-only in practice | full lifecycle | not listed | windows-admin | [src/tool-catalog.ts:245-250](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L245) |
| Browser: `browser_tabs`, `browser_page_text`, `browser_find` | Apple-event JS into Chrome, Edge, Brave and Safari; page text and find need `COMPUTER_USE_BROWSER_DOM=true` | need a user-started debug port | same as Windows | full | [src/session/browser-handlers.ts:80-94](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/browser-handlers.ts#L80), [AGENTS.md:928](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L928) |
| `scrape`, `web_search` | yes | yes | yes | full | [src/tool-catalog.ts:205-206](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L205) |
| Admin: filesystem, process_kill, registry, notification | fs, process | all four | fs, process | scripting / windows-admin | [src/tool-catalog.ts:199-202](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/tool-catalog.ts#L199) |
| Run console (8 `run_*` tools + MCP App) | opt-in | opt-in | opt-in | added to any profile | [src/agent-run.ts:724-816](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/agent-run.ts#L724) |
| Batching | `openai_computer actions[]` (at most 100, full profile only), `fill_form` (ax), `multi_select` and `multi_edit` (full) | same | same | — | [src/session/openai-handler.ts:42](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/openai-handler.ts#L42), [src/registry/definitions.ts:86-92, 300](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/registry/definitions.ts#L86) |

**Delivery, target and operator control**
- Delivery modes:
  - `auto` (the default) uses HID while the user is idle. While the user is active, it uses pid delivery for an app recorded as accepting it.
  - `hid` uses the old path and is subject to the guard.
  - `pid` is refused when it is impossible.
  - Source: [src/session/input-handlers.ts:118-163](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L118)
- The first pid delivery to an app, per input class, is verified: capture, wait 250 ms, capture, act, wait 250 ms, capture. The outcome is `changed`, `no_visible_change` or `unverified`, and it is persisted to `~/Library/Caches/computer-use-mcp/pid-delivery.json` — [src/session/input-handlers.ts:200-230](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L200), [src/session/pid-delivery.ts:11-12](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/pid-delivery.ts#L11)
- Operator control has three states: `running`, `paused` and `stopped`.
  - Pause and Stop abort the in-flight call through a merged AbortSignal, and refuse new mutating calls with `paused_by_user` or `stopped_by_user` — [src/session/operator-control.ts:164-186](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L164)
  - Stop also trips the native latch — [:224-228](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L224)
  - The card process writes `control.txt`, and the server polls that file every 150 ms with `setInterval` on the Node event loop — [:80](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L80), [:252-279](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L252)
  - The card is opt-in through `COMPUTER_USE_STATUS_CARD=true` — [:391-394](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L391)
- macOS live evidence: `npm run integration:macos` ran 25 checks, including pressing Pause, Resume and Stop, a refusal while paused, the card absent from a screenshot, and Stop tripping the latch. No equivalent exists for Windows — [docs/releases/v7.6.1.md:64-67](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L64)

**Policy and approval**
- Sensitive apps that require approval by default:
  - macOS: `com.apple.keychainaccess`, `com.apple.Passwords`, `com.1password.1password`, `com.agilebits.onepassword7`
  - Windows: `1Password.exe`, `CredentialUIBroker.exe`, `KeePassXC.exe`
  - Source: [src/session/legacy-policy.ts:126-132](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/legacy-policy.ts#L126)
- The audit log is on by default at `~/.computer-use-mcp/audit.jsonl` — [src/session/legacy-policy.ts:138-143](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/legacy-policy.ts#L138)
- Approval goes through host elicitation or a shared token in `_meta["computer-use/approval_token"]` — [AGENTS.md:93](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L93), [AGENTS.md:125](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L125)
- Allow lists and FS roots — [AGENTS.md:119](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L119), [AGENTS.md:126](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/AGENTS.md#L126)
- Dispatch order: policy evaluation, then elicitation, then the lock — [src/session.ts:334-407](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session.ts#L334)
- Unknown arguments are refused by name. Measured (M5): `click {taget_app}` returns `invalid_arguments`, "did you mean "target_app"?", and lists the accepted keys.
- Mutating tools take an in-process queue plus a cross-process lease lock at `/tmp/.computer-use-mcp.lock` (30 s TTL, renewed every 5 s). A contended lock throws `LockError` rather than queueing across processes — [src/session/lock.ts:10, 50-53, 193-211](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/lock.ts#L10)

**Protocol surface**
- The server supports legacy MCP 2025 and MCP 2026-07-28 — [src/server.ts:419-454, 489](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/server.ts#L419)
- It supports the opt-in tasks extension `io.modelcontextprotocol/tasks` — [src/mcp-tasks.ts:25](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/mcp-tasks.ts#L25)
- The bundled HTTP runner is loopback-only — [src/http.ts:12-16](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/http.ts#L12)
- It ships 4 prompts — [src/prompts.ts:15, 36, 65, 95](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/prompts.ts#L15)
- It ships 6 `computer://` resources — [src/resources.ts:38-143](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/resources.ts#L38)
- The instructions are generated per platform and profile — [src/instructions.ts:18](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/instructions.ts#L18)
- Results do not carry the review's honest-action fields (`effect`, `route`, `delivery`). Only pid deliveries report a verification — [docs/releases/v7.6.1.md:59-60](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L59), [docs/reviews/2026-10-11-end-to-end-review.md:92](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L92)

### Inferences
- For a feature comparison, macOS is the comparable platform. On Windows and Linux the server is essentially an
  input/screenshot/UIA plus scripting server: no OCR, no background delivery, no wait-for-text or wait-for-stable, and
  the guard is off unless configured.
- The only batching is an OpenAI-compatibility adapter that is absent from the default profile. A competitor with a
  general batch tool (for example the Claude API toolset that the 10-11 review cites) has a turn-count advantage the
  default surface cannot match.

### Gaps
- I did not count which of the 79 tools have fully working native backends on each platform. The catalog filters only
  OCR, Spaces and Windows-admin tools by platform. `get_app_dictionary` and `list_menu_bar` are still listed on
  Windows and Linux and return `platform_unsupported` there (AGENTS.md, Platform compatibility).
- The org-level secrets and the npm trusted-publisher configuration could not be read (HTTP 403).

## Q2. Performance mechanics: helper lifecycle, image defaults, tools/list size, observation payloads, event-loop blocking, settle delays, batching

### Takeaway
- **Tool list size:** the default list is **44,212 bytes** on macOS (41 tools), 36,188 bytes on Windows and Linux, and
  79,705 bytes for `full` on macOS. Both macOS figures sit at about 92% of the test budgets.
- **Per-call overhead:** read-only calls cost about **0.12 ms p50** in-process.
- **Swift helper:** it is **spawned once per capture or OCR call** (about 21 ms process start), and calls are serialised
  in-process and across processes by a lock file.
- **OCR cost:** accurate OCR is about 0.45 to 0.54 s per 1 to 1.5 MP image; `--fast` is about 80 ms.
- **Screenshots:** the default is 1024 px wide JPEG at q80, about 90 to 140 KB, which is 120 to 190 KB of base64.
- **Event-loop blocking:** every native call is synchronous on the Node main thread. The worst bounded blocks are
  `hold_key` (up to 10 s) and app activation (up to 2 s). Accessibility walks have no messaging timeout.
- **Delays and polling:** fixed settle delays of 8 to 300 ms are spread through the input paths, and the wait tools poll
  every 250 to 500 ms.

### Cited Findings

**tools/list size (M1; UTF-8 bytes of the tools array; chars/4 ≈ tokens as a rough heuristic only)**

| Profile | macOS tools / bytes | Windows tools / bytes | Linux tools / bytes |
|---|---|---|---|
| core | 38 / 39,213 | 36 / 35,137 | 36 / 35,137 |
| **desktop (default)** | **41 / 44,212** (~11k tok) | **37 / 36,188** | **37 / 36,188** |
| scripting | 44 / 47,485 | 40 / 39,461 | 40 / 39,461 |
| windows-admin | 51 / 52,724 | 49 / 46,246 | 41 / 40,736 |
| ax | 58 / 60,415 | 54 / 52,391 | 54 / 52,391 |
| full | 77 / 79,705 (~20k tok) | 75 / 73,227 | 67 / 67,717 |
| desktop + run console | 49 / 51,191 | 45 / 43,167 | 45 / 43,167 |
| full + run console | 85 / 86,684 | 83 / 80,206 | 75 / 74,696 |

- Byte budgets are enforced by tests: `desktop` must stay under 48,000 and `full` under 88,000 — [test/v7.6-tool-surface.test.mjs:42, 56](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v7.6-tool-surface.test.mjs#L42). Measured headroom: 3,788 bytes (desktop) and 8,295 bytes (full).
- Earlier figures:
  - Before 7.6, the default `full` list was 73 tools and 112,727 bytes — [docs/EFFICIENCY.md:8-12](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/EFFICIENCY.md#L8)
  - In 7.6.0, `desktop` was 39 tools and 45,942 bytes over stdio — same table.
- Server instructions are 2,316 to 2,741 chars on macOS (desktop: 2,351), 1,597 to 2,005 on Windows and 1,595 to 1,982 on Linux (M1).
- Largest schemas on macOS `full`, in bytes: `openai_computer` 2,555, `click_text` 2,441, `wait_for_text` 2,300, `type` 2,056, `mouse_drag` 1,920, `screenshot` 1,895, `click` 1,737, `doctor` 1,710.
- Smallest schemas: about 374 to 415 bytes (`read_clipboard`, `list_displays`, `cursor_position`).
- 10 of 77 tools carry an `outputSchema` (M1).
- `measure:efficiency` output (M2; JSON characters through the `connectInProcess` wrapper):
  - Catalog sizes: core 38 tools / 38,341; scripting 44 / 46,468; ax 58 / 59,042; full 77 / 77,867.
  - Host-side `createToolDiscovery.search('screenshot')` returns 2 to 6 tools (3,208 to 9,365 chars).
  - `compactAccessibilityTree` on a synthetic 100-button tree: 15,440 → 5,902 chars (80 nodes, truncated). The caps are 80 nodes and 8,000 chars — [src/efficiency.ts:119-121](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/efficiency.ts#L119)
  - Duplicate text/structured result: 33,550 → 18,077 chars.
  - A repeated image with a known id: 1 → 0 image blocks.
  - These helpers are opt-in on the host side.

**Per-call server overhead (M5)**
- Creating and connecting a real session took 89.7 ms. `listTools` p50 was 1.78 ms in memory.
- Read-only tool calls (`get_tool_metadata`, `get_tool_guide`, `control_status`, `policy_status`, `get_target`) ran at p50 0.12 ms and p95 0.16 to 0.22 ms, with occasional single outliers of 5 to 14 ms. These figures exclude the stdio JSON-RPC cost.

**Swift helper lifecycle and serialisation (macOS)**
- **Compile:** compiled on first use with `xcrun swiftc -O` into `~/Library/Caches/computer-use-mcp/macos-agent-helper-<sha8>` and signed ad hoc. The compile timeout is 180 s, and a failed build is retried after 10 minutes — [src/session/macos-helper.ts:119-157](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L119), [:188-202](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L188)
- **Not long-lived:** every capture or OCR is a fresh `execFile` of the binary, with a 30 s timeout and a 32 MB maxBuffer — [src/session/macos-helper.ts:89-98, 178, 250-272](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L250)
- **Capture output:** the helper writes the image to a temp file and Node reads it back — [:279-288](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L279)
- **Serialised in-process:** a promise chain — [:243-248](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L243)
- **Serialised across servers:** the lock file `helper.lock`, created with `O_EXCL` and polled every 50 ms. A dead holder's lock is taken over. After the wait (equal to the 30 s call timeout) the call fails with `helper_busy` — [:204-242](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L204)
- **Why serialise:** two concurrent SCK captures hung each other (measured by the maintainers 2026-10-09) — [:204-207](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/macos-helper.ts#L204)
- **Stall guard:** inside the helper, SCK window listing and capture each have a 10 s stall guard (`sck_timeout`) — [libexec/macos-agent-helper.swift:63-81, 115](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/libexec/macos-agent-helper.swift#L63)
- **SCK config:** `scalesToFit`, no cursor, no shadow, `captureResolution = .best` — [libexec/macos-agent-helper.swift:108-115](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/libexec/macos-agent-helper.swift#L108)
- **Measured (M3):**
  - Process start plus `version`: p50 21.1 ms (min 20.1, max 28.8, n=15).
  - Accurate OCR on a 1304×868 PNG: p50 537.7 ms (Vision 501 ms, 71 lines).
  - Accurate OCR on a 1400×1120 PNG: p50 456.3 ms (436 ms, 59 lines).
  - The first accurate call took 7,172 ms (cold Vision load).
  - `--fast`: 83.0 ms (52 ms, 50 lines) and 77.4 ms (57 ms, 47 lines). Fast mode found 18 to 30% fewer lines.
- `read_window_text` and `wait_for_text` use accurate OCR unless `fast: true` — [src/session/agent-desktop-handlers.ts:198](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/agent-desktop-handlers.ts#L198)
- Window OCR captures at a minimum pixel scale of 2 — [libexec/macos-agent-helper.swift:229-240](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/libexec/macos-agent-helper.swift#L229)

**Image sizing and encoding defaults**
- Width per provider preset:
  - 1024: anthropic, openai, grok, mistral, nova, auto
  - 512: openai-low
  - 768: gemini
  - 896: qwen, deepseek-vl, phi
  - 1120: llama
  - 1280: deepseek-flash
  - Quality: 80 by default, 75 for gemini
  - Source: [src/session/constants.ts:5-29](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/constants.ts#L5)
- Order of precedence: argument, then `COMPUTER_USE_WIDTH` / `COMPUTER_USE_QUALITY`, then the provider preset, then 1024 / 80. `quality: 0` means PNG — [src/session/screenshot-handlers.ts:56-65, 113](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/screenshot-handlers.ts#L56)
- `zoom` returns PNG unless a quality is given — [:165](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/screenshot-handlers.ts#L165)
- On Linux, `quality` only chooses PNG or JPEG. JPEG is written at the `image` crate's default quality — [native/src/screenshot.rs:134-147](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L134)
- On Windows, frames are box-filter resized in BGRA before encoding — [native/src/screenshot.rs:1150-1176](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L1150)
- **Payload estimate (M4)** for one 1024-wide JPEG at q80:

  | Source image | JPEG bytes | Base64 bytes |
  |---|---|---|
  | `console-live-1.png` (1304×868) | 134,398 | 179,200 |
  | `analytics-console.png` (1640×812) | 91,461 | 121,948 |
  | `blender-console-live.png` (1400×1120) | 140,593 | 187,460 |

  Each `sips` step took 59 to 67 ms (resample) and 25 to 32 ms (quality).
- **Unchanged frames:** when a capture matches the previous hash in the same scope, the server returns the previous
  result object, image included. CPU is saved and model bytes are not. The native path hashes only after a full
  capture — [src/session/screenshot-handlers.ts:120-121, 276-281](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/screenshot-handlers.ts#L120), [native/src/screenshot.rs:527-539](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L527)

**Synchronous native calls on the Node main thread**
- `native/src` has 160 `#[napi]` items and none is an `AsyncTask` or `ThreadsafeFunction`. The only background threads
  are the activity monitor, emergency release, clipboard and the Windows overlay — grep of [native/src/activity.rs:81, 309, 541, 855](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/activity.rs#L81), [native/src/overlay.rs:415](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/overlay.rs#L415). Every native tool call therefore blocks the event loop for its duration.
- **`hold_key`:**
  - Capped at 10 s in TypeScript ("the native hold sleeps on the server thread") — [src/session/input-handlers.ts:25-26, 496-511](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L25)
  - Natively, one call holds the keys and sleeps in 10 ms slices that only the native latch interrupts — [native/src/keyboard.rs:763-793](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/keyboard.rs#L763), [native/src/activity.rs:99-109](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/activity.rs#L99)
- **App activation:**
  - `activateApp` polls the frontmost app every 30 ms for up to `timeout` (2,000 ms from the focus path). When launching, it sleeps up to 2 s — [native/src/apps.rs:287, 291-304](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/apps.rs#L287), [src/session/focus.ts:131](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/focus.ts#L131)
  - macOS `activate_window` polls until its timeout — [native/src/windows_macos.rs:606-620](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/windows_macos.rs#L606)
- **macOS native screenshot:** `screencapture`, then up to two `sips` runs, each a blocking `.output()` — [native/src/screenshot.rs:482-505](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L482)
- **AX tree walk:**
  - Depth is capped at 20 (default 10), with no node cap in native code — [native/src/accessibility_macos.rs:511-512, 787-802](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/accessibility_macos.rs#L511)
  - `AXUIElementSetMessagingTimeout` (0.4 s) is set only in `get_window_ax_info` — [native/src/windows_macos.rs:718-728](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/windows_macos.rs#L718). It is never set in `accessibility_macos.rs` (grep).
- **Windows overlay:** `hwnd()` waits up to 750 ms in 10 ms sleeps — [native/src/overlay.rs:490-503](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/overlay.rs#L490)
- **Linux:** capture, ydotool input, wmctrl and xdotool are blocking child processes — [native/src/screenshot.rs:21-87](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L21), [native/src/mouse.rs:193-257](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L193)
- **Not blocking:**
  - Helper captures and OCR (async `execFile`).
  - `run_script` uses `spawnBounded` with a process-tree kill. Its default timeout is 30 s and the maximum 120 s — [src/registry/definitions.ts:312-315](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/registry/definitions.ts#L312), [src/session/spawn.ts:110-167](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/spawn.ts#L110)
  - PowerShell admin calls (30 s timeout) — [src/session/admin-handlers.ts:221](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/admin-handlers.ts#L221)
- **Drags are not single blocking calls.** `mouse_drag` and `left_click_drag` are TypeScript loops of short native steps.
  Each step awaits 8 or 16 ms and checks the abort signal, and the button is released in `finally` —
  [src/session/input-handlers.ts:371-389, 525-574](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L371).
  Paths are capped at 64 points and 64 steps per segment — [src/registry/definitions.ts:146, 152](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/registry/definitions.ts#L146)

**Fixed settle delays (time added to each action)**

| Path | Delays | Evidence |
|---|---|---|
| HID click | Move, then 50 ms (TS), then 15 ms (native, macOS), then 30 ms between multi-clicks | [src/session/input-handlers.ts:286-290](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L286), [native/src/mouse.rs:629, 642](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L629) |
| Focus before input (target not frontmost) | `prepare_display` 50 ms; unhide 100 ms; `activateApp` (blocking, up to 2 s) then 80 ms; `activateWindow` then 80 ms | [src/session/focus.ts:108-135](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/focus.ts#L108) |
| `scroll` | 15 ms | [src/session/input-handlers.ts:425](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L425) |
| `left_click_drag` / `mouse_drag` | 50 ms, then 16 ms per waypoint / 15 ms, then 8 ms × steps (8 by default) per segment | [src/session/input-handlers.ts:378-385, 532-566](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L378) |
| `type` | 30 ms per caret, clear or enter step. Text over 100 chars or with a newline goes through the clipboard: 100 ms + 100 ms. `mode: "keys"`: 4 ms per character. Native type: 20 UTF-16 units per event with 3 ms between | [src/session/input-handlers.ts:440-456, 451, 695, 717, 733](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L440), [native/src/keyboard.rs:468-484](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/keyboard.rs#L468) |
| `key` repeat | 5 ms between repeats | [native/src/keyboard.rs:443-454](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/keyboard.rs#L443) |
| First pid delivery to an app | 250 + 250 ms plus 3 helper captures (480 px, q60) | [src/session/input-handlers.ts:213-221](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L213) |
| Window tools | 80 to 300 ms | [src/session/window-handlers.ts:88-89, 128-134, 150](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/window-handlers.ts#L88) |
| `multi_select` / `multi_edit` | 30 to 50 ms per item | [src/session/input-handlers.ts:610-640](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L610) |
| Spaces | 250 to 1,500 ms | [src/session/spaces-handlers.ts:67-107](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/spaces-handlers.ts#L67) |

**Waits and polling**
- Polling intervals:
  - `wait_for_window`: every 250 ms
  - `wait_for_text`: every 500 ms (minimum 200)
  - `wait_for_stable`: every 250 ms (minimum 50), declaring stable after 800 ms quiet, with each capture 800 px wide at JPEG q50
  - Timeouts default to 10 s, maximum 120 s
  - Source: [src/session/agent-desktop-handlers.ts:22-30, 239-240, 292-294, 307-308, 408](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/agent-desktop-handlers.ts#L22)
- The status card's control file is polled every 150 ms — [src/session/operator-control.ts:80](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L80)
- While a mutating tool runs, the lock pump drains the run loop every 1 ms — [src/session/lock.ts:228](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/lock.ts#L228)

### Inferences
- **Stop latency during blocking calls.** Pause and Stop arrive through `control.txt`, which a `setInterval` reads on the
  same event loop that a synchronous native call blocks. During a `hold_key` (up to 10 s), a blocking activation (up to
  2 s), a native screenshot or a slow AX walk, the person's Stop is only *noticed* after the native call returns. The
  latch it trips can therefore not interrupt the hold. The 7.6.1 note says Stop makes "a drag or a hold stop
  mid-gesture" ([docs/releases/v7.6.1.md:14-15](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L14)).
  That is true for drags, which yield every step. For a hold it is true only when the latch is tripped from another
  thread (the native chord), not from the card.
- **`wait_for_text` cycle time.** In accurate mode the effective cycle is at least about 1 s: a 500 ms poll, plus an
  SCK capture at 2× or more, plus 0.45 to 0.55 s of OCR. `fast: true` would bring it to roughly 0.6 s.
- **Turn cost of a cold HID click** on a non-frontmost app: at least 2 × 80 + 50 + 15 ms of fixed sleeps, plus up to
  2 s of blocking activation, before the event is posted. Clicks into the frontmost app cost about 65 ms of sleeps.
- **Default image cost.** About 120 to 190 KB of base64 per default screenshot, plus about 44 KB of tool list on
  macOS. Hosts that load the whole list pay about 11k tokens up front under the chars/4 heuristic.

### Gaps
- **Not measured, to respect the no-capture and no-input constraint:**
  - SCK window capture time
  - `screencapture` time
  - native input latency
  - AX tree walk time on a real app
  - end-to-end screenshot round-trip
  - Peak Node event-loop stall per tool
- **Windows and Linux:** I measured nothing, since no host was available. Their payloads and latencies are unknown.
- **Image tokens:** I did not compute model-side image tokens, which depend on each provider's formula. The chars/4
  token figures are a heuristic, not tokenizer counts.
- **stdio envelope:** I measured tool lists in-process, without the stdio JSON-RPC envelope (tens of bytes).

## Q3. Correctness posture: tests per area, platform-only tests, skips, CI matrix and what it does not cover

### Takeaway
- **Suite results:** 578 Node tests, 575 passing, 0 failing and 3 skipped on this Mac in 123 s. CI runs the same suite
  on five runners (macOS arm64, Windows x64 and arm64, Linux x64 and arm64).
- **What the tests can catch:** nearly all of them replace the native module, the helper runner or dispatch with fakes.
  Regressions in what is *sent* are caught; what *happens on screen* is not.
- **Native tests:** Rust has 17 unit tests for about 10.8k lines.
- **Live checks in CI:** only "dispatches" or "returns" smoke checks.
- **Current main:** the CI run for main at 1d054b4 failed. A Windows arm64 smoke check timed out, so nothing was staged.

### Cited Findings
- **Local run (M6), 2026-10-23:** `ℹ tests 578 · pass 575 · fail 0 · skipped 3 · duration_ms 122,865`, with a wall time
  of 2:04.75 including `tsc`. Two of the skips are the Linux-only `release-stage` tests — [test/release-stage.test.mjs:15](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/release-stage.test.mjs#L15). The third is the opt-in browser backend test — [test/browser-backend.test.mjs:10](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/browser-backend.test.mjs#L10)
- **CI run 38345976977** (push of #44, 2026-10-13; `gh run view`):

  | Runner | Tests | Pass | Fail | Skipped |
  |---|---|---|---|---|
  | macOS arm64 | 578 | 575 | 0 | 3 |
  | Linux x64 | 578 | 564 | 0 | 14 |
  | Windows x64 | 578 | 558 | 0 | 20 |
  | Windows arm64 | 578 | 558 | 0 | 20 |

  - The Linux arm64 job succeeded; I did not extract its counts.
  - The **Windows arm64 job failed** in "Run new tools smoke test" with `FAIL: process_kill list — {"error":"timeout","message":"powershell Get-Process did not answer within 30000 ms"}` (10 of 11 passed).
  - "Stage npm release for approval" was therefore **skipped**. The previous main runs (2026-10-12) succeeded.
- **Platform-gated tests:**
  - `macOnly` gates in [test/cancellation.test.mjs:8](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/cancellation.test.mjs#L8), [test/v5-session.test.mjs:10-11](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v5-session.test.mjs#L10), [test/v5.2-prepare-display.test.mjs:12](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v5.2-prepare-display.test.mjs#L12), [test/v6.2-modernization.test.mjs:8](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v6.2-modernization.test.mjs#L8), [test/v5.2-lock-pump.test.mjs:9](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v5.2-lock-pump.test.mjs#L9)
  - A POSIX-only gate in [test/legacy-policy.test.mjs:124](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/legacy-policy.test.mjs#L124)
  - Despite the "integration test" labels, these use mock natives. The exceptions are `wait` and an `osascript delay 30` abort test, which use the real session — [test/cancellation.test.mjs:31-108](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/cancellation.test.mjs#L31)
- **Fakes:**
  - The helper is tested with injected runners, not the Swift binary — [test/v7.5-agent-desktop.test.mjs:46-73](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v7.5-agent-desktop.test.mjs#L46)
  - The surface tests use a dispatch stub that throws if called — [test/v7.6-tool-surface.test.mjs:12](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/v7.6-tool-surface.test.mjs#L12)
- **Test areas** (58 `*.test.mjs` files; counts are top-level `test(` calls found by grep):
  - Run console and agent examples: about 150 (agent-run-console 37, deepseek-* 63, responses-showcase 13, run-console-host 12, strategy 12, …)
  - Session handlers with mock native: about 140
  - Surface, protocol and registry: about 70 (stdio 13, v7.6-tool-surface 10, mcp-2026 7, v7.1 8, …)
  - Agent desktop, OCR and waits: about 55
  - Policy and filesystem jail: about 34
  - Packaging and staging: about 27
  - Status card: 7
- **Native tests:** 17 `#[test]` functions in Rust (activity 9, permissions 3, overlay 2, screenshot 2, keychain 1) across 10,760 lines of `native/src`.
  - `cargo test --release` runs on three hosts (macOS arm64, Windows x64, Linux x64) — [.github/workflows/ci.yml:130-172](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L130)
  - The six-target `build-native` matrix is compile-only for the cross targets — [:17-58](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L17)
- **Live checks in CI:**
  - On Windows, `smoke-windows.mjs` makes 13 checks: listTools, screenshot returns an image, cursor position, clipboard round-trip, display size, list windows, frontmost, running apps, PowerShell `run_script`, the AppleScript refusal, `get_app_dictionary` unsupported, `list_spaces`, and `get_tool_metadata`.
  - `smoke-new-tools.mjs` makes 11 checks on non-Linux runners and under Xvfb on Linux: filesystem write, read, info, list and delete; process list; registry; notification; and "multi_select dispatches" / "multi_edit dispatches". Source: [.github/workflows/ci.yml:241-279](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L241)
  - None of these checks that an input reached an app.
  - Linux has run under Xvfb with xdotool, wmctrl and xclip only since 7.6.1 — [:258-270](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L258)
- **Not covered by CI:**
  - TypeScript is built with `npx tsc` and tests run through `node --test`, so `npm run build:ts` and `npm test` never run on Windows CI — [.github/workflows/ci.yml:219, 228](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L219)
  - SCK capture, Vision OCR, pid delivery and the status card run only in local macOS scripts (`integration:macos`, 25 checks) — [docs/releases/v7.6.1.md:65-67](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L65)
  - The Windows card and the two Windows native fixes in 7.6.1 were type-checked only — [docs/releases/v7.6.1.md:57-58](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L57)
- The 10-11 review's own test findings include:
  - T6: the Linux smoke checked nothing before 7.6.1.
  - T9: no test of the `_meta` approval token.
  - T15: the Linux Docker worker is built by no job.
  - Source: [docs/reviews/2026-10-11-end-to-end-review.md:242-251](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L242)

### Inferences
- The suite is strong on contracts: schemas, refusals, policy, staging logic and result shapes. It is weak on effects.
  A competitor with per-OS oracle end-to-end ledgers (the review cites cua-driver at Win32 122/122, Quartz 145/145 and
  X11 116/116 — [docs/reviews/2026-10-11-end-to-end-review.md:268](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L268))
  has evidence of the kind this project lacks for Windows and Linux.
- Windows skips 20 tests and Linux 14, against 3 on macOS. The non-macOS platforms are therefore also the least tested.
- The red main build comes from a 30 s PowerShell `Get-Process` timeout on the arm64 runner. It looks like runner
  slowness rather than a code regression, but it blocks every release from main until it is handled.

### Gaps
- I did not inspect which 20 tests Windows skips or which 14 Linux skips, beyond the gates listed above.
- I did not verify Linux arm64 counts or whether the Windows arm64 smoke timeout recurs. There is only one main run
  since #44.
- I did not run `cargo test` locally, because it is not in the allowed command list.

## Q4. Known open defects: verification at 1d054b4

### Takeaway
- All seven listed defects are still in the code.
- The "drag" half of the Pause/Stop defect is overstated. Drags yield to the event loop every step. `hold_key` (and
  blocking activation) does not.
- I verified ten more defects or limits that matter for a comparison, including:
  - Windows primary-monitor-only input and capture, with no DPI awareness
  - unscaled OpenAI-adapter coordinates
  - Linux child processes writing into the MCP stdout
  - an SCK capture `--region` that the helper ignores
  - stale tool counts in the docs

### Cited Findings

| # | Defect | Status | Evidence |
|---|---|---|---|
| 1 | Windows window capture by `GetDC` + `BitBlt` | **Open.** `GetWindowRect`, `GetDC(hwnd)`, `BitBlt`, `GetDIBits`; results ignored (`let _ =`). No `PrintWindow` or Windows.Graphics.Capture anywhere in `native/src` (grep). Screen capture is DXGI output 0 (primary) with a GDI fallback. The review notes that the rect includes the invisible DWM border and that minimised windows yield garbage (N9). | [native/src/screenshot.rs:1000-1046](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L1000), [:814](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L814), [:944-997](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L944), [review:192](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L192) |
| 2 | Synchronous `hold_key` / drag blocking Pause and Stop | **Open for `hold_key`; not reproduced for drags.** `hold_key` is one synchronous native call, up to 10 s, interruptible only by the native latch. The card's Stop reaches the server through a 150 ms `setInterval` poll that cannot run during the call. `mouse_drag` and `left_click_drag` await 8 or 16 ms per step and check the signal, so they abort within a step. The same blocking applies to `activateApp` (up to 2 s). Related: `type_text` returns `Ok` when latched (N11). | [src/session/input-handlers.ts:25-26, 496-511](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L25), [native/src/keyboard.rs:763-793](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/keyboard.rs#L763), [src/session/operator-control.ts:252-279](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/operator-control.ts#L252), [src/session/input-handlers.ts:380-387, 555-567](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/input-handlers.ts#L380), [native/src/keyboard.rs:469-477](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/keyboard.rs#L469), [review:173](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L173) |
| 3 | `scripts/build-ts.mjs` uses `npx.cmd` | **Open.** `execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', …)` without `shell: true`. The repo has a shell-free helper for exactly this case (`npm-command.mjs`, which runs `npm-cli.js` through `process.execPath`), but `build-ts.mjs` does not use it. CI never runs `build:ts` on Windows (it uses `npx tsc`), so CI cannot catch this. | [scripts/build-ts.mjs:16](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/scripts/build-ts.mjs#L16), [scripts/npm-command.mjs:1-14](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/scripts/npm-command.mjs#L1), [.github/workflows/ci.yml:219](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L219) |
| 4 | `npm run build` is not portable | **Open.** `build` is `build:native && build:ts`. `build:native` is macOS-only (`.dylib`, `uname`/`sed`, `codesign`). `prepublishOnly` runs `npm run build`, so publishing from a Windows or Linux checkout fails. CI avoids this with `npm pack --ignore-scripts`. CONTRIBUTING's quick start says `npm run build`. | [package.json:142, 148, 154](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/package.json#L142), [CONTRIBUTING.md:8-14](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/CONTRIBUTING.md#L8) |
| 5 | Linux: missing `wmctrl` gives an empty window list | **Open.** `Command::new("wmctrl")…unwrap_or_else(\|_\| Command::new("true").output().unwrap())` gives empty stdout and `[]` with no error. Linux `hide_app` also returns `true` unconditionally on X11. | [native/src/windows.rs:65-69](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/windows.rs#L65), [native/src/apps.rs:160-163](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/apps.rs#L160) |
| 6 | Native staging fails on a published-integrity mismatch and runs with no token | **Open (not yet exercised on main).** See the detail after this table. | [scripts/stage-platform-packages.mjs:40-62](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/scripts/stage-platform-packages.mjs#L40), [.github/workflows/ci.yml:497-536](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L497) |
| 7 | E409 tolerance removed for the main package | **Open, and deliberate in #44.** See the detail after this table. | [.github/workflows/ci.yml:521-532](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/.github/workflows/ci.yml#L521), [test/release-stage.test.mjs:15](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/test/release-stage.test.mjs#L15), [CHANGELOG.md:67](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/CHANGELOG.md#L67), [docs/releases/v7.6.1.md:44](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/releases/v7.6.1.md#L44), [review:238](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L238) |

**Detail for defect 6 (native staging):**
- **Integrity mismatch throws.** `stage-platform-packages.mjs` throws `Published <spec> differs from this build; bump the version` (`:42`). For the same condition, the main-package step only warns and exits 0 (`ci.yml:514-518`).
- **The native step runs first.** It runs before the main step (`ci.yml:497-501`), so after any release a later push to main with rebuilt native tarballs would fail the publish job, unless the builds are byte-identical.
- **Other errors also throw.** Any `npm view` error other than E404 throws (`:45`), and so does any stage error, including E409 (`:49-62`).
- **No token is configured.** `NODE_AUTH_TOKEN: ${{ secrets.NPM_NATIVE_STAGE_TOKEN }}` (`ci.yml:501`), but `gh secret list` shows only `NPM_TOKEN` at repository level. Org secrets could not be read (HTTP 403).
- **The main step relies on OIDC.** It runs with `NODE_AUTH_TOKEN: ''` and `NPM_CONFIG_USERCONFIG=/dev/null` (`ci.yml:535-536`).
- **Not yet exercised.** The publish job was skipped in the only main run since #44.

**Detail for defect 7 (E409 tolerance):**
- The #44 diff deleted the `grep -q "E409\|…already staged"` warning branch. Any `npm stage publish` failure now exits non-zero (`ci.yml:521-532`).
- A test asserts "main staging fails closed on E409". It is Linux-only and skipped on macOS (`release-stage.test.mjs:15`).
- The 7.6.1 CHANGELOG and release note still say the job tolerates an already-staged version (`CHANGELOG.md:67`, `v7.6.1.md:44`).
- Removing the tolerance brings back review finding T2: a push while a version awaits approval fails the publish job (`review:238`).

**Additional defects and limits verified in code (useful for the comparison)**
- **Windows input and capture are primary-monitor-only, with no DPI awareness.** Input scales by `SM_CXSCREEN`
  without `MOUSEEVENTF_VIRTUALDESK`, GDI capture uses the `SM_CXSCREEN` size, and DXGI uses `EnumOutputs(0)`. There is
  no `SetProcessDpiAwareness` call (grep) — [native/src/mouse.rs:835](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L835), [native/src/screenshot.rs:814, 950](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L814), [review:175](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L175)
- **The OpenAI adapter does not scale coordinates.** `openai-compat.ts` and `openai-handler.ts` contain no scale
  logic (grep for "scale" finds nothing), while screenshots default to 1024 px. On a 2560-point display, clicks land
  2.5× off — [review C5:139](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L139), [src/session/openai-compat.ts:20-35](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/openai-compat.ts#L20)
- **Linux child processes can corrupt the MCP stream.** They use `.status()` and so inherit the server's stdio; on
  stdio transport, stdout is the MCP channel. macOS uses `.output()` and its source comment explains why —
  [native/src/screenshot.rs:25-56](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L25), [native/src/keyboard.rs:144-242](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/keyboard.rs#L144), [native/src/mouse.rs:193-257](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/mouse.rs#L193), [native/src/screenshot.rs:479-485](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L479)
- **The helper ignores `--region` on capture.** `macos-helper.ts` passes `--region` to `capture` (`:282`), but the
  Swift `capture` command never reads it. As a result `wait_for_stable` always reports `regionApplied: false` and
  hashes the whole window — [libexec/macos-agent-helper.swift:214-228](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/libexec/macos-agent-helper.swift#L214), [src/session/agent-desktop-handlers.ts:301-312](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/src/session/agent-desktop-handlers.ts#L301)
- **Linux JPEG quality is ignored.** The `image` crate default is used — [native/src/screenshot.rs:134-147](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/screenshot.rs#L134)
- **AX walks have no messaging timeout.** The general macOS walk sets no `AXUIElementSetMessagingTimeout`, so a
  hung app can stall the server thread — [native/src/accessibility_macos.rs:787-802](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/accessibility_macos.rs#L787), [native/src/windows_macos.rs:728](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/windows_macos.rs#L728)
- **Open issues:**
  - #32: the Windows `agent_pointer` overlay deadlock. The cause was fixed in 7.4.0 but the fix is unverified on
    hardware, and `hwnd()` still polls up to 750 ms on the napi thread — [review:176](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L176), [native/src/overlay.rs:490-503](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/native/src/overlay.rs#L490)
  - #21: Linux AT-SPI returns empty AX windows.
  - PR #40 (the Windows card) is still open.
  - Source: `gh issue list` and `gh pr list`, 2026-10-23.
- **Main CI is red.** The Windows arm64 `process_kill list` smoke check timed out at 30 s (run 38345976977).
- **Tool counts in the docs are stale.** The docs say 40/36; the code lists 41/37 (Q1).

### Inferences
- **Release pipeline.** Defects 6 and 7 together mean the next release will most likely fail at staging. Either no
  token is available to the native step, or a second push while a version is pending hits E409. Main is already red
  for an unrelated smoke timeout. A competitor shipping weekly (the review cites Peekaboo releases 4.6 to 4.9 between
  Sep 22 and Oct 7 — [review:267](https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/docs/reviews/2026-10-11-end-to-end-review.md#L267))
  has a cadence this pipeline cannot match today.
- **Windows ladder.** The Windows capture ladder (PrintWindow, then Windows.Graphics.Capture, then a marked BitBlt) and
  DPI or multi-monitor awareness are the clearest gaps against cua-driver's Windows support, which the review describes.

### Gaps
- **Not run, by constraint:** I did not run Windows or Linux, so defects 1, 3 and 5 were verified by reading the code.
  Their runtime symptoms rest on the code and on known platform behaviour. For defect 3, Node refusing to spawn `.cmd`
  without a shell since the 2024 security releases is outside knowledge, not tested here.
- **Native reproducibility:** whether the native tarballs build byte-for-byte reproducibly, which decides whether
  defect 6's integrity check actually trips, is unknown.
- **Secrets:** whether an org-level `NPM_NATIVE_STAGE_TOKEN` exists is unknown (HTTP 403).
