# Rival releases reset the 7.7 roadmap

Between 2026-10-11 and 2026-10-23, desktop computer-use competitors changed what they compete on. Being able to click is no longer the question. The question now is whether a tool reports honestly, recovers on its own and yields to a person. cua-driver shipped five releases (0.35.2 to 0.38.0) that do the following:

- attach a recovery hint and a safe `next_call` to every refusal
- classify effects as confirmed, unverifiable or a suspected no-op
- drag in the background, and refuse drag-and-drop instead of faking it
- detect a locked screen
- cut waits inside batched steps

Elsewhere in the field:

- **Windows-MCP** merged about twenty PRs that harden its user-control gate and put timeouts on UI Automation calls.
- **Peekaboo** shipped six reliability patches. One of them covers macOS 27's rename of the Accessibility permission row.
- **Hermes** moved computer-use tools behind tool search and stopped resending unchanged screenshots.
- **KDE Plasma 6.8** retired X11 sessions.
- **Codex and Claude Code** shipped no computer-use changes.

computer-use-mcp 7.6.1 (main at `1d054b4`, which includes PR #44) still leads in two areas: on-device OCR for apps that draw their own UI, and a status card that never appears in screenshots and closes when the server exits. It has none of the new contracts listed above. Its Windows input is DPI-unaware and reaches only the primary monitor. Its release pipeline will most likely fail at staging.

Model time dominates a computer-use step: 75–94% of task time in the one independent breakdown, against 1.0–3.6% for screenshots and 0.9–2.3% for actions. So the most valuable work removes model turns and resent image bytes, not native milliseconds. The plan below has two parts:

- **7.6.2:** a short release of small, confirmed fixes. It unblocks publishing, makes every cancelled or stopped gesture release what it pressed, and stops reporting success for Windows input that never landed.
- **7.7:** built around four things: a result contract (`effect`, `route`, `hint`, `next_call`), a batch tool, not resending unchanged frames, and moving slow native calls off the event loop.

The two disputes in the notes resolve cleanly:

- **Drags vs `hold_key`.** Drags already stop within one step. Only `hold_key`, app activation and accessibility walks keep a person's Stop from taking effect. Stop does leave a right or middle mouse button held down.
- **Tool counts.** macOS lists 41 tools by default and 77 under `full`. Windows and Linux list 37 by default. Every count in the docs is one short.

*Conventions: every `path:line` refers to commit `1d054b4` and resolves under `https://github.com/zavora-ai/computer-use-mcp/blob/1d054b4/`. Local measurements were taken on 2026-10-23 on an Apple M4 with macOS 26.2 and Node 25.4. Nothing was run on Windows or Linux, so effects on those platforms are inferred from the code and from competitors' measurements. They are marked as such.*

## The field spent twelve days on honest results, person-first gates and Wayland

**cua-driver moved furthest, and almost every change it made is a contract at its dispatch layer, not work on individual tools.** It released versions 0.35.2, 0.35.4, 0.36.0, 0.37.0 and 0.38.0 between Oct 13 and Oct 21.

- **Background drag (0.36.0).** The press, the interpolated moves and the release are posted to the window's process through the private SkyLight `SLEventPostToPid`. They carry window-routing fields and a gesture ID, and the cursor is never warped. Because AppKit drag-and-drop follows the hardware pointer, the driver watches for the drag-image window and returns `background_unavailable` / `drag_and_drop_session` rather than reporting a false success ([PR #5309](https://github.com/trycua/cua/pull/5309)).
- **Recovery hints (0.37.0).** Every refusal and every unconfirmed action may carry a `hint` of at most 240 characters and a `next_call` that is "always safe to run as is". Both are attached once, from one table. The stated rationale is that "agents often stopped at the first refusal even when a working route existed" ([PR #5493](https://github.com/trycua/cua/pull/5493)).
- **Batch pacing (0.37.0).** A profile of 63 runs with Claude Code driving the driver measured a median of **41 s of tool time against 49 s of model time**. A click took 1.35 s, mostly a 550–880 ms cursor glide plus a 300 ms window watch, while an accessibility press alone took 78 ms. Inside batches, waits are now capped at 120 ms for the cursor and 100 ms for window changes, and an agent that makes three single actions in a row is told to batch ([PR #5487](https://github.com/trycua/cua/pull/5487)).
- **Locked screen (0.37.0).** A `screen_locked` refusal is read fresh on every gate. Each call also holds an IOKit `PreventUserIdleDisplaySleep` assertion, released 10 minutes after the last call ([PR #5483](https://github.com/trycua/cua/pull/5483)).
- **Brief foreground step (0.37.0).** An operator-only opt-in "the agent can't turn on" lets the driver repeat a refused drag in the foreground. It then reports whether the frontmost app and the pointer were restored ([PR #5481](https://github.com/trycua/cua/pull/5481)).
- **Guidance where agents look (0.37.0).** A `get_guide(topic)` tool plus installing a skill pack, because agents "never loaded" the skill. The macOS server instructions are capped at 200 words ([PR #5491](https://github.com/trycua/cua/pull/5491)).
- **DOM click classification (0.38.0).** Effects are classified with a bounded readback as confirmed, suspected no-op or unavailable ([PR #5586](https://github.com/trycua/cua/pull/5586)).

One cua fix does not apply here. ScreenCaptureKit's default `showsCursor = true` distorted window captures by about 37 px ([PR #5480](https://github.com/trycua/cua/pull/5480)), but our helper already sets `config.showsCursor = false` (`libexec/macos-agent-helper.swift:112`).

**Peekaboo and the hosted agents mostly hardened what they had.** Peekaboo shipped 4.9.1 to 4.9.6 between Oct 11 and Oct 20. One change matters directly here: 4.9.4 names **macOS 27's renamed "Device Control and Data Access" Settings row** for Accessibility and Event Synthesizing, and rejects NaN and infinite coordinates ([v4.9.4](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.4)). 4.9.5 lets each route declare which permission it needs, and 4.9.6 handles apps that re-exec themselves (PID −1) ([v4.9.5](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.5), [v4.9.6](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.6)).

Codex's official changelog has no computer-use entries in the window ([Codex changelog](https://learn.chatgpt.com/docs/changelog)). Users filed two new reports of overlays left behind after stop: "arrow ghosts" ([#53944](https://github.com/openai/codex/issues/53944)) and a cursor marker that stays after "stop computer use" ([#55540](https://github.com/openai/codex/issues/55540)).

Claude Code 2.1.299 to 2.1.309 changed no computer-use behaviour. Three host-side changes bear on any MCP server ([CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)):

- Third-party tool descriptions and server instructions are still cut at 4,096 characters by default.
- 2.1.302 fixed servers that negotiate 2026-07-28 but omit `resultType`, `ttlMs` or `cacheScope`.
- 2.1.304 turned tool search on by default behind a custom `ANTHROPIC_BASE_URL`.

Claude Desktop shipped three relevant fixes ([Claude app changelog](https://claude.com/docs/cowork/changelog)):

- Oct 13: a dropdown opened by a click or key in a background app is closed again at once, instead of swallowing what you type.
- Oct 15: it no longer types text twice into a busy background page.
- Oct 22: tools that their server marks as "needing a person" are asked only on the in-app card, and scheduled tasks skip them.

Hermes 0.22.0 shipped "Bot Screen": a person takes the screen at a login or CAPTCHA and hands it back. It also deferred computer-use schemas behind `tool_search`, cutting them **from 13,367 to 6,883 tokens** ([v0.22.0](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.0)). An identical capture now returns text metadata and no image ([PR #98954](https://github.com/NousResearch/hermes-agent/pull/98954)).

**On Windows, the month's work went into a person's control and bounded UI Automation.** Windows-MCP published no release after 0.8.8, but its main branch gained these changes:

- The control gate can be turned off, and its idle timeout set ([#458](https://github.com/CursorTouch/Windows-MCP/pull/458)).
- Held-key bookkeeping is reconciled with `GetAsyncKeyState` after a missed key-up ([#460](https://github.com/CursorTouch/Windows-MCP/pull/460)).
- Takeover now needs **500 units of cumulative raw physical movement**, with a 0.5 s gap resetting the count. 128 small movements totalling 237 units no longer interrupt the agent ([#466](https://github.com/CursorTouch/Windows-MCP/pull/466)).
- The server skips its own overlay windows in tree walks. Snapshot went **from 15.2 s to 0.5–0.6 s** ([#476](https://github.com/CursorTouch/Windows-MCP/pull/476)).
- Japanese IME mode keys no longer latch the gate ([#481](https://github.com/CursorTouch/Windows-MCP/pull/481)).
- Chords validate every key before pressing any, and release in reverse order on any exception ([#485](https://github.com/CursorTouch/Windows-MCP/pull/485)).
- UI Automation calls are bounded with `IUIAutomation2` timeouts (2 s connection, 5 s transaction). Snapshot with a hung window on screen went **from 127.5 s to 6.6 s** ([#497](https://github.com/CursorTouch/Windows-MCP/pull/497)).

Still open: wireless receivers that stream zero-delta mouse moves keep that gate in `user` mode forever ([#498](https://github.com/CursorTouch/Windows-MCP/issues/498)).

cua's Windows work in the same window:

- PostMessage clicks are made deterministic by suspending the target GUI thread around the posts ([#5584](https://github.com/trycua/cua/pull/5584)).
- A foreground drag is refused when another window covers the target ([#5616](https://github.com/trycua/cua/pull/5616)).
- Raw `BitBlt failed` errors are now classified as "locked" or "RDP disconnected" ([#5266](https://github.com/trycua/cua/pull/5266)).

Microsoft Execution Containers (MXC) went GA on Oct 7, with v1.0.1 on Oct 17. Its session containers give an agent "isolated desktop, clipboard, UI, and input boundaries" ([MXC launch post](https://blogs.windows.com/windowsdeveloper/2026/10/07/microsoft-execution-containers-policy-driven-containment-for-ai-agents/)). Claude Code and Hermes are listed as "coming" ([Windows Experience Blog](https://blogs.windows.com/windowsexperience/2026/10/07/building-windows-for-hybrid-intelligence/)).

**On Linux the ground moved under X11 tooling.** KDE Plasma 6.8 (Oct 14) says starting X11 sessions "is being retired", and keeps XWayland only for individual apps ([KDE](https://kde.org/announcements/plasma/6/6.8.0/)). Ubuntu 26.10 shipped GNOME 51 a day later ([UbuntuHandbook](https://ubuntuhandbook.org/index.php/2026/10/ubuntu-26-10-released-with-kernel-7-3-gnome-51-amd64v3-image/)). agent-sh/computer-use-linux shipped seven releases. It is Wayland-first: GNOME Shell D-Bus or portal screenshots, RemoteDesktop portal or uinput input, and a compositor-specific window registry that reports which backend won ([README](https://github.com/agent-sh/computer-use-linux#readme)). It now also detects XKB layout swaps and keyboard grabs during typing, and errors rather than replaying text ([v0.7.21](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.21), [v0.7.22](https://github.com/agent-sh/computer-use-linux/releases/tag/v0.7.22)). cua refuses its GNOME helper on GNOME 50 and later after reports of crashes that ended the session ([#5565](https://github.com/trycua/cua/pull/5565)).

Nothing relevant shipped from UFO, UI-TARS-desktop, Agent S, Bytebot (archived) or Open Interpreter. Apple published nothing new beyond the permission rename.

The table below sets 7.6.1 against the best that shipped by Oct 23. The field has converged on four contracts this server lacks, while its two leads still hold.

| Capability | Best shipped by Oct 23 | computer-use-mcp 7.6.1 | Position |
|---|---|---|---|
| Recovery after refusal | `hint` + safe `next_call` on every refusal (cua #5493) | `suggestedRecovery` on focus failures only (`src/session/errors.ts:16`, `src/session/focus.ts:71-85`), `similarLabels`, `availableMenus` | Behind |
| Effect honesty | confirmed / unverifiable / suspected no-op (cua #5586; Peekaboo 4.9.5) | Verified only for the first pid delivery to an app (`src/session/input-handlers.ts:200-230`); a HID click returns `Clicked (x, y)` (`:291`) | Behind |
| Batching | Anthropic toolset batch; OpenAI `actions[]`; cua capped waits | `openai_computer actions[]`, `full` profile only (`src/session/openai-handler.ts:42`) | Behind |
| macOS background input | SkyLight per-pid, including drag, menus and off-Space reads (cua 0.36) | `delivery:"pid"` for clicks, scroll, type and key (`src/session/input-handlers.ts:29-31`), with a per-app verification record | Behind on drag and menus |
| Apps that draw their own UI | No on-device OCR shipped by anyone in the window | Vision OCR, `click_text`, `wait_for_text`, `wait_for_stable` | **Ahead** |
| A person's control | Hermes take-and-hand-back; Windows-MCP 500-unit takeover; Codex overlays still leak | Pause/Stop card, excluded from capture, closes when the server exits; opt-in (`src/session/operator-control.ts:391-394`); no takeover; chord not armed | Ahead on lifecycle, behind on defaults |
| Locked screen | `screen_locked` + display-awake assertion; Windows locked/RDP classes | None (no `CGSessionCopyCurrentDictionary` or `IOPMAssertion` in `src`, `native` or `libexec`) | Behind |
| Windows window capture | PrintWindow → WGC → crop with an occlusion flag (cua) | `GetDC` + unchecked `BitBlt` (`native/src/screenshot.rs:1000-1046`) | Behind |
| Windows geometry | DPI-aware, virtual-desktop normalization | DPI-unaware, primary monitor only (`native/src/mouse.rs:834-843`) | Behind |
| UIA time bounds | `IUIAutomation2`, 2 s / 5 s | v1 `CUIAutomation`, no timeouts (`native/src/accessibility.rs:88-93`) | Behind |
| Linux on Wayland | Portals, libei, compositor-aware window lists | `gnome-screenshot`/`grim`/`scrot`; `org.gnome.Shell.Eval` window list (`native/src/screenshot.rs:22-113`, `native/src/windows.rs:45-63`) | Behind |
| Tool-list cost | Hermes 6,883 tokens deferred; Anthropic toolset about 4,500 | 44,212 bytes (about 11k tokens) by default | Behind; host tool search softens it |

## Measured, 7.6.1 lists 41 tools and only holds block Stop

**The repository is in good contract health and weak effect health.** On this Mac, read-only tool calls cost **0.12 ms p50** in-process. The default macOS tool list is **44,212 bytes**, about 92% of its 48,000-byte test budget (`test/v7.6-tool-surface.test.mjs:42`).

The Swift helper is spawned for every capture or OCR call, at about **21 ms** of process start (`src/session/macos-helper.ts:250-288`). It writes each image to a temporary file that Node reads back (`:279-285`). So images do not pass through stdout as text, and the "binary over a pipe" idea in one note does not apply. Accurate Vision OCR takes **456–538 ms** p50 on a 1–1.5 MP image. Fast mode takes 77–83 ms but finds 18–30% fewer lines. A default screenshot is a 1024-px JPEG at quality 80: 91–141 KB, or **122–187 KB of base64** per frame.

The native addon exports 160 `#[napi]` functions and none is an `AsyncTask`. Every native call therefore runs on the Node event loop.

The suite runs 578 tests (575 pass, 3 skipped). Nearly all of them use fake natives, and only 17 Rust unit tests cover 10.8k lines of native code. Main is red: in CI run 38345976977 the Windows arm64 `process_kill list` smoke check timed out at 30 s, so release staging was skipped.

### Drags stop within a step; `hold_key` does not; Stop strands right and middle buttons

The notes disagree. `our_baseline.md` says drags yield every 8–16 ms and stop mid-gesture. `bug_classes.md` lists "hold_key and drags are synchronous N-API calls". **The code supports `our_baseline.md` on blocking, and supports a different `bug_classes.md` finding (its A3) on the real drag defect.**

**Drags yield.** `mouse_drag` is a TypeScript loop (`src/session/input-handlers.ts:525-574`). Each step does three things:

- checks the abort signal (`:559`)
- posts one native event, since `mouseDragTo` → `post_button_event` creates and posts a single CGEvent (`native/src/mouse.rs:523-548, 563-571`)
- awaits `this.#sleep(8)` (`:566`), which is a `setTimeout` promise (`src/session/spawn.ts:7`)

`left_click_drag` does the same with `signal?.throwIfAborted()` and a 16 ms await (`:379-385`). Between steps the event loop is free. The status card's Stop is written to `control.txt`, and a 150 ms `setInterval` reads it (`src/session/operator-control.ts:80, 260-279`). That timer fires during the awaits, aborts the session controller (`:243-251`) and trips the latch (`:224-229`). The next step then throws. **Worst-case Stop latency for a drag is about one 150 ms poll plus one step.**

**`hold_key` blocks.** It is one synchronous native call (`src/session/input-handlers.ts:507`). On macOS that call presses every key and then sleeps in `interruptible_sleep` (`native/src/keyboard.rs:764-793`; Windows `:999-1016`). That sleep checks only the native latch, in 10 ms slices (`native/src/activity.rs:99-109`). In the stock server, only two things can set the latch:

- `stop()`, which runs from that `setInterval` callback and cannot fire while the main thread is inside `holdKey`
- the physical chord, which only the host-embedding supervisor configures (`src/supervisor-worker.ts:5`)

So for up to `MAX_HOLD_SECONDS = 10` (`src/session/input-handlers.ts:26`), Pause, Stop, `notifications/cancelled` and `control_status` all wait. The same holds, more briefly, for three other calls:

- `activateApp`, which polls for up to 2,000 ms (`src/session/focus.ts:131`; `native/src/apps.rs:287-304`)
- the macOS full-screen path, which runs `screencapture` plus up to two `sips` as blocking children (`native/src/screenshot.rs:482-505`)
- accessibility walks, which have no messaging timeout

The 7.6.1 release note's claim that Stop makes "a drag or a hold stop mid-gesture" (`docs/releases/v7.6.1.md:14-15`) is therefore true for drags and false for a hold stopped from the card.

**The drag defect that matters is in the cleanup.** Once Stop has tripped the latch, the drag's `finally` calls `mouseRelease`. `post_button_event` checks `ensure_not_emergency_stopped()?` before it posts the button-up (`native/src/mouse.rs:530` macOS, `:934` Windows, `:336` Linux), so the release is refused. The latch does start a release thread (`native/src/activity.rs:77-81`), but `release_agent_held_buttons` releases only the tracked left button (`native/src/mouse.rs:669-685`, `:1044-1048`), and on Linux it does nothing at all (`:1096`).

**A Stop during a middle-button orbit in Blender, which is AGENTS.md's own example, therefore leaves the middle button held at the OS level.** On Linux even the left button stays down. Pause does not trip the latch, so a paused drag releases correctly. Peekaboo ([#797](https://github.com/steipete/Peekaboo/issues/797)), Windows-MCP ([#483](https://github.com/CursorTouch/Windows-MCP/issues/483)) and cua Spaces ([#5677](https://github.com/trycua/cua/issues/5677)) all hit the same press-on-one-path, release-on-another class this month.

### The catalog has 79 tools, but no platform lists 79

`TOOL_CATALOG` defines 79 tools, and its comment ("79 in 7.6.1 with control_status", `src/tool-catalog.ts:132`) is correct. No platform lists all of them, because 12 tools are limited to some platforms (`src/tool-catalog.ts:238-251`):

- `registry` and `notification` exist only on Windows.
- The four OCR and wait tools (`read_window_text`, `click_text`, `wait_for_text`, `wait_for_stable`) exist only on macOS.
- The six Spaces tools exist on macOS and Windows.

The note that says "dist lists 77 on macOS full" is right: 79 − 2 = 77. The figures below come from running `listedTools(platform, profile)` from the built `dist`. They match the in-process `tools/list` measurement in `our_baseline.md` exactly.

| Profile | macOS | Windows | Linux | Docs today (macOS / Windows / Linux) |
|---|---|---|---|---|
| core | 38 | 36 | 36 | 37 / 35 / 35 |
| **desktop (default)** | **41** | **37** | **37** | 40 / 36 / 36 |
| scripting | 44 | 40 | 40 | 43 / 39 / 39 |
| windows-admin | 51 | 49 | 41 | 50 / 48 / 40 |
| ax | 58 | 54 | 54 | 57 / 53 / 53 |
| full | 77 | 75 | 67 | 76 / 74 / 66 |
| run console added | +8 (desktop 49, full 85) | +8 | +8 | "desktop 40 to 48, full 76 to 84" |

On macOS, `desktop` is the 38 `core` tools plus `agent_pointer`, `wait_for_text` and `wait_for_stable`.

**Every documented figure is exactly one short, because `control_status` (core, every platform, `src/tool-catalog.ts:220`) shipped in 7.6.1 after the counts were updated for `unhide_app` (`:169`).** The release note contradicts itself. One line says the default macOS list "is 40 tools" (`docs/releases/v7.6.1.md:30`). Another says it "grows by two tools (`unhide_app`, `control_status`)" from 7.6.0's 39 (`:53`), which gives 41.

The docs should give the measured numbers above in these places:

- `AGENTS.md:17-19`: "41 tools … `full` lists 77 … core 38, desktop 41, scripting 44, windows-admin 51, ax 58, full 77 (Windows 36/37/40/49/54/75, Linux 36/37/40/41/54/67)"
- `AGENTS.md:135` and `:289`: 41 against 77
- `AGENTS.md:876`: desktop 41 to 49, full 77 to 85
- `AGENTS.md:1036-1037`: 41/37/37 by default and 77/75/67 for `full`
- `README.md:145`: 41
- `CHANGELOG.md:25` and `docs/releases/v7.6.1.md:30`: 41 tools, 37 on Windows and Linux
- `docs/EFFICIENCY.md:112, 125`: still quote 7.6.0's 36/42/57/76

The byte figures in AGENTS.md ("about 44 KB on the wire", and 84,037 for `full`) come from a different method than the in-process 44,212 and 79,705. The docs should state the method next to each number. A test that derives the counts from `listedTools` and checks the docs against them would end this class of drift for good.

## Ranked by value over cost, turns and truth beat milliseconds

Each item is ranked by its value over its cost.

- **Value** means how many model turns, wrong actions or harms to the person's desktop the change prevents, weighted by how strong the evidence is.
- **Cost** means lines of code, behavioural risk, and whether it needs hardware that CI lacks.

The time data sets the direction. In OSWorld-Human, planning and reflection calls take **75–94%** of task time, against **1.0–3.6%** for screenshots and **0.9–2.3%** for actions ([arXiv 2506.16042](https://arxiv.org/html/2506.16042v1)). On OSWorld 2.0, Opus 4.7 averages about **318 tool calls per task** ([OSWorld 2.0](https://osworld-v2.xlang.ai/)). cua's own profile is the counterweight: with cursor glides and watch windows, tool time came close to model time (41 s against 49 s) ([PR #5487](https://github.com/trycua/cua/pull/5487)).

Together these say two things. Fixed waits per action matter, because they multiply by hundreds of calls. Capture milliseconds matter much less than removing whole model turns and the image bytes that every turn resends.

### Features: recovery hints, effect classes and a batch tool lead

| Rank | Feature | Field evidence | Where it lands in this code | Cost | Ship |
|---|---|---|---|---|---|
| 1 | A `hint` (≤240 chars) and a safe-to-run `next_call` on every refusal and unverified result, from one table | cua [#5493](https://github.com/trycua/cua/pull/5493) | Errors are already built in one place, `errJson` (`src/result.ts:48`), and dispatch has one seam (`src/session.ts:319-591`). Generalise `suggestedRecovery` (`src/session/errors.ts:16`), the admin `hint` (`src/session/admin-handlers.ts:226`) and the nearest-argument refusal (`src/registry/registry.ts:363-391`) | S | 7.7 |
| 2 | `effect` (`verified` / `unverifiable` / `no_visible_change` / `refused`), `route` and `delivery` on every action; never a success for an unverified effect (the 10-09 R1, still unshipped) | cua [#5586](https://github.com/trycua/cua/pull/5586); Peekaboo no-op classes ([v4.9.5](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.5)); Claude Desktop no longer reports text typed when nothing was ([changelog](https://claude.com/docs/cowork/changelog)) | A HID click returns `ok('Clicked …')` (`src/session/input-handlers.ts:291`). The pid route already classifies `changed` / `no_visible_change` / `unverified` (`:200-230`); reuse that classifier and capture | M | 7.7 |
| 3 | A `run_steps` batch tool in `desktop`: validate every target first, activate once, cap waits inside the batch, stop at the first failure with the remaining steps answered "not executed", one optional final capture or region | Anthropic batch actions and OpenAI `actions[]` ([Anthropic docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool), [OpenAI guide](https://developers.openai.com/api/docs/guides/tools-computer-use)); UFO2 speculative multi-action cut OSWorld-W steps from 13.30 to 7.40 and from 6.80 to 3.30 ([UFO2](https://arxiv.org/html/2504.14603v2)) | The only batch today is `openai_computer` (`src/session/openai-handler.ts:42`), in `full` only, and its coordinates are unscaled (`src/session/openai-compat.ts:20-35`) | M | 7.7 |
| 4 | A person's control by default: the card on by default on macOS, the native chord armed by default, and takeover on deliberate physical input | Hermes Bot Screen; Windows-MCP 500-unit takeover ([#466](https://github.com/CursorTouch/Windows-MCP/pull/466)); Claude Code consumes Esc ([docs](https://code.claude.com/docs/en/computer-use)) | The card is opt-in (`src/session/operator-control.ts:391-394`). The chord is armed only by the supervisor (`src/supervisor-worker.ts:5`). The guard already timestamps physical input (`src/session/user-activity.ts:19`). An armed chord also fixes the `hold_key` Stop gap, because it latches from another thread | M | 7.7 |
| 5 | A `screen_locked` refusal plus a display-awake assertion on macOS; "locked" and "RDP disconnected" errors on Windows | cua [#5483](https://github.com/trycua/cua/pull/5483), [#5266](https://github.com/trycua/cua/pull/5266) | None today. Add a gate at dispatch and a `doctor` row (`src/session/doctor.ts`) | S | 7.7 |
| 6 | macOS 27 permission naming | Peekaboo [v4.9.4](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.4) | `src/session/doctor.ts:165, 172` and the README/AGENTS Cursor guidance say "Accessibility". Confirm the exact string on a macOS 27 machine first | XS | 7.6.2 |
| 7 | Wayland foundations: portal and GNOME Shell screenshots, a compositor-aware window list, and `doctor` naming the backend that won | computer-use-linux [README](https://github.com/agent-sh/computer-use-linux#readme); Plasma 6.8 retires X11 sessions | The capture chain is `gnome-screenshot` → `grim` → `scrot` (`native/src/screenshot.rs:22-113`). The window list relies on `org.gnome.Shell.Eval` (`native/src/windows.rs:45-63`), which stock GNOME restricts (secondary source: [GNOME Discourse](https://discourse.gnome.org/t/terminal-command-to-open-app-drawer-and-switch-between-applications/8226)) | L | 7.7 start, 7.8 libei |
| 8 | Remembered approval scopes ("this app for this session"); map approval-required tools onto the host's "needs a person" marker once its form is documented | Codex and Claude approval models; Claude Desktop Oct 22 | Policy layer `src/session/legacy-policy.ts`; `policy_status` | M | 7.8 |
| 9 | Background (pid) drag with an honest `drag_and_drop_session` refusal; an operator-only, restore-verified foreground step | cua [#5309](https://github.com/trycua/cua/pull/5309), [#5481](https://github.com/trycua/cua/pull/5481) | `mouse_drag` is not in `PID_DELIVERY_TOOLS` (`src/session/input-handlers.ts:29-31`); the existing `*_to_pid` natives in `native/src/mouse.rs` are the model | L | 7.8 |

The first three items are one design. A result that says what happened (rank 2) and what to try next (rank 1) is what makes a batch (rank 3) safe to run without a screenshot after every step. Peekaboo and cua ship exactly this pairing. The 7.6.1 release note already promises it, under "the default is the question for 7.7" (`docs/releases/v7.6.1.md`, Known limits).

Two field features should not be copied:

- **Owner-authorized self-approval of macOS permission prompts** (cua [#5467](https://github.com/trycua/cua/pull/5467)). It conflicts with this server's posture of never passing `force: true` unless the person asked.
- **Posted window messages for Windows keyboard input.** Microsoft's own guidance is UI Automation first, then `SendInput` ([Old New Thing, 2025](https://devblogs.microsoft.com/oldnewthing/20250319-00/?p=110979)). The background-safe route on Windows is the existing UIA `click_element` and `set_value`.

### Performance: remove turns and resent images before native milliseconds

| Rank | Change | Expected gain | Where in the code | Cost | Ship |
|---|---|---|---|---|---|
| 1 | The batch tool above, with activation once per batch and waits capped as cua did (120 ms cursor, 100 ms window) | One model round trip saved per extra action. UFO2 measured 44–52% fewer steps on OSWorld-W | Focus costs 80 + 80 ms of sleeps plus up to 2 s of blocking activation (`src/session/focus.ts:108-135`); a HID click adds 50 + 15 ms (`src/session/input-handlers.ts:289`, `native/src/mouse.rs:629`) | M | 7.7 |
| 2 | Return text, not the image, when a capture is unchanged, with a streak cap that re-sends after N repeats | Today an unchanged frame returns the cached result, image included (`src/session/screenshot-handlers.ts:120-121`, `:281`). That is 122–187 KB of base64 and about 780–1,040 visual tokens per repeat at 1024 px wide (Claude charges ⌈w/28⌉×⌈h/28⌉; [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)) | Hermes [#98954](https://github.com/NousResearch/hermes-agent/pull/98954) is the reference | S | 7.7 |
| 3 | Take `hold_key` off the event loop: native press and release primitives, the hold awaited in TypeScript with `sleepAbortable` (`src/session/spawn.ts:13`), and the release in `finally` | Pause, Stop and cancellation take effect within a poll instead of up to 10 s | `src/session/input-handlers.ts:496-511`; `native/src/keyboard.rs:764-793, 999-1016, 221` | S | 7.6.2 |
| 4 | Bound accessibility: an `AXUIElementSetMessagingTimeout` on every walk, and `CUIAutomation8`/`IUIAutomation2` with 2 s / 5 s timeouts on Windows | Windows-MCP: 127.5 s → 6.6 s with a hung window ([#497](https://github.com/CursorTouch/Windows-MCP/pull/497)). The Windows default transaction timeout is 20 s ([MS Learn](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation2-put_transactiontimeout)) | Only `get_window_ax_info` sets a 0.4 s timeout today (`native/src/windows_macos.rs:728`); walks are at `native/src/accessibility_macos.rs:573-610`; UIA is created at `native/src/accessibility.rs:88-93` | S | 7.6.2 |
| 5 | Move the slow native calls (AX and UIA walks, activation, native screenshots) to napi `AsyncTask`, and watch `control.txt` with `fs.watch` instead of a 150 ms poll | `control_status`, cancellation and Stop keep working during long calls; target Stop under 50 ms | `native/Cargo.toml` (napi 2, no `AsyncTask` anywhere); `src/session/operator-control.ts:80` | M–L | 7.7 |
| 6 | A tool-list diet to pay for new tools: move the five click aliases to `full` (still callable there), and trim the largest schemas (`click_text` 2,441 B, `wait_for_text` 2,300 B, `type` 2,056 B) | `desktop` has 3,788 bytes of budget headroom. Anthropic's whole toolset is about 4,500 tokens ([docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)); tool search cut 77K tokens to 8.7K ([Anthropic](https://www.anthropic.com/engineering/advanced-tool-use)) | `src/tool-catalog.ts:144-149`; `test/v7.6-tool-surface.test.mjs:42` | S | 7.7 |
| 7 | Make the helper honour `--region` (crop with `sourceRect`) | `wait_for_stable` can ignore spinners and clocks, so it stops waiting for nothing; smaller hashes and images | The helper's `capture` never reads `--region` (`libexec/macos-agent-helper.swift:214-228`), although `src/session/macos-helper.ts:282` passes it; `src/session/agent-desktop-handlers.ts:301-312` reports `regionApplied: false` | S | 7.6.2 |
| 8 | Replace macOS full-screen `screencapture` plus two `sips` runs with a ScreenCaptureKit display capture in the helper | Removes two blocking children (59–67 ms resample, 25–32 ms requality) and their event-loop stall | `native/src/screenshot.rs:450-505` | M | 7.7 |
| 9 | Poll `wait_for_text` with fast OCR and confirm a hit with accurate OCR | Cycle time drops from about 1 s to about 0.6 s; fast OCR misses 18–30% of lines, so confirm before returning | `src/session/agent-desktop-handlers.ts:23, 198` | S | 7.7 |
| 10 | A long-lived helper and a persistent SCStream for the waits | Saves about 21 ms of spawn per call. A one-shot window capture costs about 89 ms in-process; a stream costs 81 ms to open, then about 17 ms per frame at 60 fps ([sckit-go](https://pkg.go.dev/github.com/LocalKinAI/sckit-go@v0.3.1)) | `src/session/macos-helper.ts:204-288`. Two concurrent SCK captures used to hang each other (`:204-207`), so the lock semantics must survive the move | M–L | 7.8 |
| 11 | Honour JPEG quality on Linux | Bytes per frame on Linux | `native/src/screenshot.rs:134-147` | XS | 7.6.2 |

**The event-loop work (items 3 and 5) is a safety fix that looks like a performance item.** The only things a person can use to stop an agent travel through the same Node thread that a synchronous native call holds. Splitting `hold_key` is small and closes the worst case now. `AsyncTask` and an armed chord close the class in 7.7.

On background input, `delivery: "pid"` already avoids activation, and with it the 160 ms of sleeps and up to 2 s of blocking activation per cold action. It is used only while the user is active, for apps recorded as `changed` (`src/session/input-handlers.ts:118-163`). Whether known-good apps should get pid delivery even when the user is idle is worth measuring in 7.7. No source publishes activation latency or pid-versus-HID timings, so this repository should measure them with its own benchmark harness before changing the default.

### Bug fixes: the release pipeline, abnormal-path cleanup, then Windows geometry

The ranking puts first what blocks a release or leaves the person's machine in a bad state, then what reports success for input that did not land, then hygiene. "Class" names the competitor failure this server shares. Defects found only here are marked "ours".

| # | Defect | Class (evidence) | Code | Size | Ship |
|---|---|---|---|---|---|
| 1 | Main CI is red: the Windows arm64 `process_kill list` smoke check timed out at 30 s | ours (CI run 38345976977) | `src/session/admin-handlers.ts:218-226`; `.github/workflows/ci.yml:272-277` | XS | 7.6.2 |
| 2 | The next release will most likely fail at staging. The native step throws on an integrity mismatch, while the main step only warns. Any non-E404 `npm view` error and any E409 throw. `NPM_NATIVE_STAGE_TOKEN` is not a repository secret (org-level unknown). #44 removed the main package's E409 tolerance while `CHANGELOG.md:67-68` and `docs/releases/v7.6.1.md:44` still promise it. `cancel-in-progress` can cut a stage | ours | `scripts/stage-platform-packages.mjs:40-62`; `.github/workflows/ci.yml:11, 498-536`; `test/release-stage.test.mjs:15` (Linux-only) | S | 7.6.2 |
| 3 | `build:ts` spawns `npx.cmd` without a shell, and `npm run build` uses POSIX tools; CI cannot catch either | ours | `scripts/build-ts.mjs:16` (the shell-free `scripts/npm-command.mjs` exists); `package.json:142-154`; `ci.yml:219` | S | 7.6.2 |
| 4 | Every documented tool count is one short | ours | See the count table above | XS | 7.6.2 |
| 5 | Stop strands right and middle buttons (and every button on Linux): the latch blocks the button-up | Peekaboo [#797](https://github.com/steipete/Peekaboo/issues/797); cua [#4692](https://github.com/trycua/cua/issues/4692) | `native/src/mouse.rs:530, 934, 336`; release hook `:669-685, 1044-1048, 1096` | S | 7.6.2 |
| 6 | `hold_key` blocks Pause, Stop and cancellation for up to 10 s | ours | See Performance 3 | S | 7.6.2 |
| 7 | `hold_key` leaks a partial press on Windows and X11: keys are pressed one by one, and the first unknown name returns early. TypeScript accepts F13–F20, which those maps lack | Windows-MCP [#483](https://github.com/CursorTouch/Windows-MCP/issues/483), fixed by validate-then-press ([#485](https://github.com/CursorTouch/Windows-MCP/pull/485)) | `native/src/keyboard.rs:1004-1012, 256-264`; `src/session/keys.ts:16-22` | S | 7.6.2 |
| 8 | macOS chords carry their modifier flags on the key-up and mouse-up | Peekaboo #797, fixed in [PR #803](https://github.com/openclaw/Peekaboo/pull/803). Whether our private event source avoids the effect is unverified | `native/src/keyboard.rs:448-450, 787-791`; `native/src/mouse.rs:541-542, 634-638` | S | 7.6.2 |
| 9 | A cancelled screenshot falls through to a second, synchronous capture | Peekaboo [#289](https://github.com/steipete/Peekaboo/issues/289) | `src/session/screenshot-handlers.ts:115-117` → `:102` | XS | 7.6.2 |
| 10 | `type` returns success when the latch stopped it part-way | Claude Desktop's "typed when nothing was" | `native/src/keyboard.rs:469-478, 950-953, 208-210` | XS | 7.6.2 |
| 11 | macOS `type` splits surrogate pairs at fixed 20-unit chunks | Windows-MCP [#436](https://github.com/CursorTouch/Windows-MCP/issues/436) (same class) | `native/src/keyboard.rs:474-475` | XS | 7.6.2 |
| 12 | Windows clicks reach the primary monitor only and truncate to one pixel short: `SM_CXSCREEN` normalization, no `MOUSEEVENTF_VIRTUALDESK` | Windows-MCP [#441](https://github.com/CursorTouch/Windows-MCP/issues/441); cua [#1981](https://github.com/trycua/cua/issues/1981); [MOUSEINPUT](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-mouseinput) | `native/src/mouse.rs:834-843` and the send sites | S | 7.6.2 |
| 13 | `SendInput` return values are ignored, so input that UIPI blocks reports success | Ours; [SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput) says UIPI failures are not signalled | `native/src/keyboard.rs:904, 994`; `native/src/mouse.rs:828, 860, 904` | XS | 7.6.2 |
| 14 | The first DXGI capture of a still desktop maps a staging texture that was never written; GDI `BitBlt`/`GetDIBits` results are unchecked | claude-code [#103212](https://github.com/anthropics/claude-code/issues/103212); cua [#4064](https://github.com/trycua/cua/issues/4064) | `native/src/screenshot.rs:850-862, 909-923, 957, 1016` | XS | 7.6.2 |
| 15 | Windows `prepare_display` minimizes cloaked and system windows (TextInputHost, LockApp) | claude-code [#102334](https://github.com/anthropics/claude-code/issues/102334), [#97945](https://github.com/anthropics/claude-code/issues/97945) | `native/src/apps.rs:634-680` | S | 7.6.2 (filter) |
| 16 | `unhide_app` on Windows also restores windows the user had minimized before the session | claude-code [#91794](https://github.com/anthropics/claude-code/issues/91794) | `native/src/apps.rs:729-766` | M | 7.7 |
| 17 | `multi_edit` sends `\n` as Unicode 0x0A; the Windows comment claims VK_RETURN | cua [#4477](https://github.com/trycua/cua/issues/4477) | `src/session/input-handlers.ts:639`; `native/src/keyboard.rs:960-962` against `:979-989` | XS | 7.6.2 |
| 18 | PowerShell `run_script` output is not forced to UTF-8, and each chunk is decoded on its own | Windows-MCP [#493](https://github.com/CursorTouch/Windows-MCP/issues/493) | `src/session/scripting-service.ts:109-125`; `src/session/spawn.ts:153-154` (`application-discovery.ts:77` already does it right) | XS | 7.6.2 |
| 19 | The Windows guard counts zero-delta mouse moves as activity | Windows-MCP [#498](https://github.com/CursorTouch/Windows-MCP/issues/498) | `native/src/activity.rs:491-498` | XS | 7.6.2 |
| 20 | macOS walks have no AX messaging timeout; Windows UIA has no timeouts | cua [#4213](https://github.com/trycua/cua/issues/4213); Windows-MCP #497 | See Performance 4 | S | 7.6.2 |
| 21 | The macOS activity tap is never re-enabled after `kCGEventTapDisabledByTimeout`, so the guard reads the user as idle forever | ours | `native/src/activity.rs:382` (only the first `tap.enable()`) | XS | 7.6.2 |
| 22 | `pbcopy`/`pbpaste` run without a locale and mangle non-ASCII when the host omits `LANG` | pbcopy(1) | `src/session/input-handlers.ts:515, 521, 727-738` | XS | 7.6.2 |
| 23 | The `agent_pointer` overlay is not excluded from full-screen captures; the status card is | cua [#4194](https://github.com/trycua/cua/issues/4194) | `native/src/overlay.rs:150-180` (no `sharingType`), `:413-440` (no display affinity); compare `libexec/macos-status-card.swift:110` | XS | 7.6.2 |
| 24 | Linux shell-outs inherit the MCP stdout, and missing tools return empty results or silent success | ours (the macOS path documents why it avoids this, `native/src/screenshot.rs:479-481`) | `.status()` at `native/src/screenshot.rs:25-85`, `keyboard.rs:144, 212-242`, `mouse.rs:193-257`; xclip at `clipboard.rs:64-67`; `windows.rs:65-69`; `apps.rs:124-127` | S | 7.6.2 |
| 25 | Stringified coordinate arrays are refused, not coerced | Windows-MCP [#272](https://github.com/CursorTouch/Windows-MCP/issues/272) | `src/registry/definitions.ts:19-20` | XS | 7.6.2 |
| 26 | The Windows process is DPI-unaware: UIA bounds are physical, mouse and GDI coordinates virtualized | cua [#3449](https://github.com/trycua/cua/issues/3449), [#1879](https://github.com/trycua/cua/issues/1879); claude-code [#93992](https://github.com/anthropics/claude-code/issues/93992); node.exe declares no DPI awareness ([manifest](https://raw.githubusercontent.com/nodejs/node/main/src/res/node.exe.extra.manifest)) | No DPI-awareness call in `native/src`; `native/src/accessibility.rs:195, 457` | M | 7.7 |
| 27 | Windows window capture is `GetDC` + `BitBlt` (black for DirectComposition apps, wrong when occluded or minimized); full-screen capture covers output 0 only | Codex [#54690](https://github.com/openai/codex/issues/54690); Windows-MCP [#416](https://github.com/CursorTouch/Windows-MCP/issues/416); cua's ladder ([capture.rs](https://github.com/trycua/cua/blob/main/libs/cua-driver/rust/crates/platform-windows/src/capture.rs)) | `native/src/screenshot.rs:1000-1046, 793-815` | L | 7.7 |
| 28 | The clipboard restore is timed and text-only, so an image or file list the user copied becomes empty text after a long `type` | Peekaboo [#1111](https://github.com/steipete/Peekaboo/issues/1111) (open) | `src/session/input-handlers.ts:715-739`; `native/src/clipboard.rs:108-125` | M | 7.7 |
| 29 | `run_script` waits for `close`, so a backgrounded grandchild holds the call until it times out | Windows-MCP [#146](https://github.com/CursorTouch/Windows-MCP/issues/146) | `src/session/spawn.ts:173` | S (behaviour change) | 7.7 |
| 30 | No autorelease pool anywhere in the addon, so long sessions leak | cua [#4663](https://github.com/trycua/cua/issues/4663) (same class) | grep of `native/src`: zero | M | 7.7 |
| 31 | `scrape` fetches loopback and link-local addresses; `filesystem search` walks synchronously and cannot be cancelled | ours | `src/session/admin-handlers.ts:343-345, 177-191` | S | 7.7 |

Several competitor classes are already guarded, and the plan should keep them that way:

- **Typing.** macOS and Windows type as Unicode, independent of keyboard layout (`native/src/keyboard.rs:474-485, 985-995`). The Windows clipboard is sized in UTF-16 units (`native/src/clipboard.rs:155-160`).
- **Accessibility walks.** UIA runs in the multithreaded apartment with node limits (`native/src/accessibility.rs:88-93, 226-256`).
- **The capture helper.** It runs once per call, with a 10 s capture timeout and a lock shared across servers (`libexec/macos-agent-helper.swift:63-81`; `src/session/macos-helper.ts:204-242`).
- **Child processes.** They are spawned with `windowsHide`, and PATH and PATHEXT are kept (`src/session/spawn.ts:42-63, 119`).
- **The status card.** It watches the server pid and is excluded from capture (`libexec/macos-status-card.swift:110`; `libexec/windows-status-card.ps1:69`).
- **Pause** aborts the call in flight instead of parking it (`src/session/operator-control.ts:243-251`).
- **Coordinates** are checked for finiteness and display bounds (`src/session/input-handlers.ts:700-708`), which is the check Peekaboo added this month.

One nuance on the Windows guard. The low-level hook keeps a `PHYSICAL_MODIFIERS` bitmask for the chord (`native/src/activity.rs:487-521`). A missed key-up, the Windows-MCP #460 class, could leave a modifier counted as held, so an armed chord could fire early. That matters once item 4 of the features table arms the chord by default.

## A two-week 7.6.2, then a contract-first 7.7

7.6.2 adds no features. Every item is a confirmed defect, and each fix is roughly 30 lines or fewer, with one pipeline change. The order is set by dependency: publishing must work before anything can ship. Cleanup on the stop and cancel paths comes before Windows truthfulness, because the first can be tested on this Mac and the second needs a Windows tester.

| Order | 7.6.2 work item | Defects closed | Done when |
|---|---|---|---|
| 1 | Make main green: give the arm64 `process_kill` smoke check a longer budget or a retry, and drop the sort from the PowerShell pipeline | 1 | CI run green on all five runners |
| 2 | Fix staging: warn on an integrity mismatch for native packages as the main step does; tolerate "already staged" again, or document the fail-closed choice and correct the CHANGELOG; confirm the token or OIDC for the new names; run the release-stage tests on macOS too | 2 | A dry stage of a pending version passes; tests run on every OS |
| 3 | Build portability: `build-ts` through `npm-command.mjs`; a portable `build` (or CONTRIBUTING says `build:native` is macOS-only); run `npm run build:ts` on Windows CI | 3 | Windows CI runs `build:ts` |
| 4 | One native PR for cleanup on abnormal paths: release events bypass the latch and track all three buttons; implement the Linux release; validate-then-press in `hold_key` with a `Drop` guard; F13–F20 on Windows and Linux; clear flags on the final key-up and mouse-up; `type` errors when latched; surrogate-safe chunks | 5, 7, 8, 10, 11 | macOS integration: after `key shift+tab`, `NSEvent.modifierFlags` is 0; after Stop during a middle-button drag, the button state is up |
| 5 | Take `hold_key` off the event loop: press and release primitives, a TypeScript hold with `sleepAbortable`, release in `finally` | 6 | A test with a fake native shows Pause aborting a 10 s hold within one poll |
| 6 | Rethrow `aborted` in `#sckScreenshot` | 9 | A test: an aborted capture makes no native call |
| 7 | A "Windows truth" PR: `VIRTUALDESK` normalization with rounding; checks on `SendInput` counts and a typed refusal when input is blocked; copy the DXGI warm-up frame and check GDI results; the `prepare_display` filter (cloaked, tool and owned windows, plus shell and input processes); `multi_edit` newlines through the paste route; UTF-8 PowerShell and a `StringDecoder`; `CUIAutomation8` timeouts; ignore zero-delta mouse moves | 12–15, 17–20 | Pure-function tests for normalization, including monitors at negative origins; `cargo check` for the Windows target; a hardware check by the #40 contributor before tagging |
| 8 | macOS hygiene: AX messaging timeout on walks; re-enable the tap; `LANG` for pbcopy and pbpaste; overlay `sharingType = none`; helper `--region` | 20–23; Performance 7 | `wait_for_stable` reports `regionApplied: true` |
| 9 | Linux hygiene: `.output()` or `Stdio::null()` for every shell-out; a named error when a tool is missing; JPEG quality | 24; Performance 11 | Smoke check under Xvfb without `wmctrl` returns a named error |
| 10 | Coerce stringified coordinate arrays | 25 | A test with `"[100,200]"` |
| 11 | Docs and drift: correct the counts and the byte methods; a test that derives counts from `listedTools` and checks the docs; macOS 27 permission wording once confirmed | 4; Feature 6 | The drift test fails on a wrong count |

7.7 is the minor release that adopts the field's contracts. Its order follows how the pieces depend on each other: the result contract first, because the batch tool and the default status card both read from it.

| Order | 7.7 work item | Builds on |
|---|---|---|
| 1 | The result contract at the dispatch layer: `effect`, `route` and `delivery` on every action, and `hint` plus a safe `next_call` on every refusal and unverified result, from one table in `src/result.ts` and `src/session.ts`. Update `src/instructions.ts` to describe it | Features 1–2 |
| 2 | `run_steps`: validate first, activate once, capped waits, stop at the first failure, one optional final capture or region. Pay for it by moving the click aliases to `full`; fix the OpenAI adapter's scaling if it shares code | Features 3; Performance 1, 6 |
| 3 | No resending of unchanged frames, with a streak cap; prefer region captures as observations | Performance 2 |
| 4 | Move slow natives to `AsyncTask`; `fs.watch` for the card; a Stop-latency test with a target under 50 ms | Performance 5 |
| 5 | A person's control by default: the card on for macOS (Windows stays opt-in until it has been run on hardware); the chord armed by default, with modifier reconciliation; takeover on deliberate physical input; `screen_locked` and the display-awake assertion; Windows "locked" and "RDP disconnected" errors | Features 4–5 |
| 6 | Windows geometry and capture in one change: per-monitor DPI v2 awareness with one coordinate contract; PrintWindow (`PW_RENDERFULLCONTENT`) → WGC → crop with an occlusion flag → a refusal for minimized windows; capture of every output; HWND-precise restore. Gated on a two-monitor test at 150% | Bugs 16, 26, 27 |
| 7 | Wayland foundations: portal and GNOME Shell screenshot paths, a window list that does not depend on `Shell.Eval`, backend names in `doctor`; a libei design note | Feature 7 |
| 8 | macOS capture speed: ScreenCaptureKit display capture in place of `screencapture` + `sips`; fast-poll `wait_for_text`; autorelease pools | Performance 8–9; Bug 30 |
| 9 | Carried over: a clipboard guard for non-text contents; `run_script` completes on exit plus a grace period; `scrape` host rules; an async filesystem walk | Bugs 28, 29, 31 |

Deferred to 7.8 or later:

- the long-lived helper and persistent SCStream
- pid-delivered drag with the honest drag-and-drop refusal
- remembered approval scopes
- a layout-aware `key` on macOS and Linux (the semantics of hotkeys must be decided first, as Peekaboo did in [#330](https://github.com/steipete/Peekaboo/issues/330))
- installing the skill pack per host

Three uncertainties bound this plan:

- **Windows and Linux were not run.** Their defects were confirmed by reading the code. The effects are inferred from documented API behaviour and competitors' measurements, so the Windows items must not be tagged without a hardware check.
- **Some macOS effects are unconfirmed.** Whether the modifier flags (bug 8) actually stick under a private event source, and the exact macOS 27 Settings string, both need a local check.
- **Some pipeline and competitor facts are unknown.** Whether an org-level `NPM_NATIVE_STAGE_TOKEN` exists could not be read (HTTP 403). Codex facts come from user reports, not OpenAI. Claude Desktop's "needs a person" marker has no documented wire form yet.

## Conclusion

The competition has moved to contracts at the dispatch layer, and that favours this repository. Its errors are already built in one function and its calls pass through one dispatch path. The most valuable features this cycle (the hint, the effect, the batch) are therefore a table and a loop, not a rewrite of individual tools. The risk is the gap between what the guidance promises and what the code does. The instructions and the release notes have described honest effects since 7.6.0. cua and Peekaboo shipped them weekly while this server shipped none. Agents that are told to trust a contract the code does not keep are worse off than agents that are told nothing.

The less visible lesson is that this server's largest performance debt is a safety problem. Every way a person can stop the agent travels through the Node thread that synchronous native calls hold. A hold, a slow activation or a hung accessibility walk silences Stop for seconds. A Stop that does arrive mid-drag can leave a mouse button held. Fixing the stop and cancel paths, and moving long calls off the thread, protects the status card that is this server's clearest lead. Codex's leaked overlays show how quickly a person's trust in such a control disappears.

On Windows, the honest position until the 7.7 geometry and capture work lands is that coordinate input is reliable only on a single monitor at 100% scaling. Microsoft's new agent containers may soon put that to the test on machines this project does not control.
