# macOS-centric and hosted computer-use agents: what changed 2026-10-11 to 2026-10-23

Scope note for the writer: the window is 2026-10-11 to 2026-10-23. Anything dated earlier is labelled **baseline**.
Release timestamps are GitHub `publishedAt` values in UTC; a changelog heading date can be a day earlier than its tag.
Codex facts marked "user report" come from issues filed on openai/codex, not from OpenAI documentation. Repository
facts about computer-use-mcp were checked against the working tree on 2026-10-23 (`main` at 1d054b4).

## Q1. What shipped since 2026-10-11 from Peekaboo, cua/cua-driver (macOS), Codex Computer Use, Claude Code / Claude Desktop computer use and Hermes, and what changed?

### Takeaway
cua-driver changed the most: five releases (0.35.2 to 0.38.0) between Oct 13 and Oct 21. They add background drag
through per-process SkyLight posting, background menu commands and reads of pages on another Space, a structured
`hint`/`next_call` on every refusal and unverifiable result, faster batched steps, locked-screen detection with a
display-awake assertion, and an operator opt-in for a brief, verified foreground step. Peekaboo shipped six patch
releases (4.9.1 to 4.9.6, Oct 11 to 20), mostly reliability work. One item matters directly here: macOS 27 renames the
Accessibility row in Settings to "Device Control and Data Access". Neither Codex nor Claude Code published any
computer-use change in its changelog. Claude Desktop shipped background-input and safety fixes (Oct 13, 15 and 22).
Hermes 0.22.0 (Oct 13) shipped "Bot Screen" takeover and token cuts (tools deferred, unchanged screenshots not resent).

### Cited Findings

**Peekaboo (repository moved: `steipete/Peekaboo` now resolves to `openclaw/Peekaboo`)** — [Repo](https://github.com/openclaw/Peekaboo)
- **4.9.1** (tag Oct 11 20:14 UTC; changelog dated Oct 10). An idle `peekaboo mcp` no longer burns CPU when unrelated apps launch or quit, because AXorcist 0.2.2 indexes workspace apps by identity. Measured on about 594 running apps: 0.668/0.684 s down to 0.025/0.021 s of CPU per launch or quit. Foreground MCP move and drag now accept signed global coordinates (#963). Capture-action stdout/stderr is kept when the 64 KiB retention limit splits a UTF-8 scalar (#1006). — [Release v4.9.1](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.1)
- **4.9.2** (Oct 12): Swift Subprocess 1.0.1 makes child-process pipes close-on-exec. Releases are now built, signed and notarized on GitHub Actions behind an approval gate, with a fallback to the Notary REST API. — [Release v4.9.2](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.2)
- **4.9.3** (Oct 14): manual `peekaboo daemon start` gets the shared 10 s readiness budget and reports the real auth or probe failure. The MCP wrapper shuts down its server and exits 1 on fatal errors, and repeated wrapper starts no longer spawn duplicate servers (#1039, #1020, #1021). Cooperative and URL cancellation is classified as `CANCELLED` (#1042). — [Release v4.9.3](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.3)
- **4.9.4** (tag Oct 16; changelog Oct 15). Permission guidance and errors now name **macOS 27's renamed "Device Control and Data Access" Settings row for Accessibility and Event Synthesizing**, and consistently say "Screen & System Audio Recording" (#1071). `click`, `move`, `capture`, `see --region` and MCP `click` reject `nan` and infinite coordinates and regions (#1074-#1076). A granted Peekaboo.app bridge host stays selected when an ungranted on-demand daemon starts (#1073). — [Release v4.9.4](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.4)
- **4.9.5** (tag Oct 17; changelog Oct 16). Each route declares whether it needs Accessibility or Event Synthesizing (`type`, `paste`, `press`/`hotkey`, `window`, `menu`, `menubar`), so hosts without that grant are skipped (#1088). A complete AX observation is no longer reported as incomplete when an app declines an inapplicable child attribute (#1094). A multi-app `quit` that is a suspected no-op is reported as a no-op, not as a partial change (#1098). Unsigned source builds fall back to in-process execution, and `PEEKABOO_ALLOW_UNSIGNED_DAEMON=1` is an opt-in (#1089). — [Release v4.9.5](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.5)
- **4.9.6** (Oct 20). Peekaboo can find, inspect and capture apps that re-exec themselves (AppKit reports PID -1; Xcode's Device Hub, for example) by recovering one verified live process (#1121). `window close` counts as closed when the app keeps the `NSWindow` alive or quits during verification (#1116, #1109). `see`/`analyze` use a saved Vision model (`agent.visionModel`) (#1110). In the Mac chat app, the Stop button stays attached to the running task, follow-ups queue behind it, and Stop discards the queue (#1095). — [Release v4.9.6](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.6)
- **Unreleased on main** (as of Oct 23): `see` handles Chrome windows whose AX title appends the app name or whose WindowServer title is middle-elided (#1130); Inspector highlight boxes land on the right display when a display does not start at the primary origin (#1132); Dock separators and Trash are classified from AX subroles (#1120). — [CHANGELOG](https://github.com/openclaw/Peekaboo/blob/main/CHANGELOG.md)
- AXorcist, Peekaboo's AX library, is now `openclaw/AXorcist`; its latest release is 0.2.2 (Oct 10, baseline). — [AXorcist releases](https://github.com/openclaw/AXorcist/releases)

**cua-driver-rs (trycua/cua; the "Pre-release" label only keeps the monorepo's "Latest" pointer stable, and the release notes say these are stable releases)**
- **0.35.2** (Oct 13): background scrolling of an inner Electron scroller on macOS (#5079). — [Release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.35.2)
- **0.35.4** (Oct 14). Background Cmd+V is refused when the browser's focus is its omnibox (#5124). `list_windows` stays valid when macOS reports non-finite window bounds (#5125). Background browser clicks reach pointer-driven rows (#5110). One approved Chrome connection is shared across sessions (#5115). Background popups and context menus stay open on macOS (#5129). `type_text` fails when a character cannot be typed (#5139). Each character gets its own spare keycode (#5158). Computer History (`session.json`, `action.json` recordings) is isolated under `CUA_DRIVER_RS_HOME` (#5165). — [Release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.35.4)
- **0.36.0** (Oct 16), headlined "background work on macOS more reliable". It adds background typing into LibreOffice; a page tree on Chrome's first background read; background drag; background menu commands; reading pages on another Space; dropdowns that no longer raise the window; and no focus bounce after background clicks. The bare binary now fails loudly without a WindowServer connection, and `health_report` gains a `windowserver_connection` check (#5333). Unconfirmed Electron scrolls are refused (#5251), results report the actual browser delivery mode (#5222), and autoreleased objects are drained on SCK capture workers (#5170). — [Release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.36.0)
  - **Background drag mechanism** (#5309, merged Oct 15). The press, the interpolated drags and the release go to the window's process through SkyLight `SLEventPostToPid` (the public per-pid API is the fallback), carrying window-routing fields f51/f91/f92, target pid f40 and one gesture ID f58. Nothing goes to the HID tap and the cursor is never warped; the user's front app and key window are restored afterwards. AppKit drag-and-drop follows the hardware pointer, so the driver watches for the drag-image window at level 500 and returns `background_unavailable` / `drag_and_drop_session` instead of a false success. — [PR #5309](https://github.com/trycua/cua/pull/5309)
  - **Background menus and off-Space reads** (#5307). A background `AXPress` first makes the target window AppKit-key "with the focus record only", so toolbar actions such as TextEdit Bold take effect. `invoke_menu` waits up to 600 ms for a disabled item to revalidate. Menu-bar items are proven to belong to the app through its own `AXMenuBar`. Off-Space Chrome `get_text`/`query_dom` falls back to an already-held CDP session or the window's `AXWebArea`. The PR says this was not verified on a VM. — [PR #5307](https://github.com/trycua/cua/pull/5307)
- **0.37.0** (Oct 20): 5 features and 17 fixes. — [Release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.37.0)
  - **Recovery hints** (#5493). Every refusal and every unconfirmed action, on all tools and platforms, may carry `hint` (at most 240 chars) and `next_call: {tool, arguments}`. `next_call` is "always safe to run as is": a read, or a call that leaves the user's window where it is. A foreground retry or anything needing consent is never a `next_call`; the hint names it with its condition. The fields are attached once at the dispatch seam from one table (`recovery_hint.rs`). Rationale: "agents often stopped at the first refusal even when a working route existed." — [PR #5493](https://github.com/trycua/cua/pull/5493)
  - **Owner-authorized self-approval of the driver's own macOS prompts** (#5467). When the owner explicitly authorizes it for a machine they own or run, an agent may click Allow on Cua Driver's own Accessibility/Screen Recording prompts through VNC/Screen Sharing (`vncdotool`). Guardrails: only `com.trycua.driver` prompts, never on someone else's machine, stop on an unexpected dialog, log each approval. MDM PPPC is the preferred route; MDM cannot grant Screen Recording silently. — [PR #5467](https://github.com/trycua/cua/pull/5467)
  - **Brief foreground step** (#5481). With operator opt-in `CUA_DRIVER_ALLOW_BRIEF_FOREGROUND=1` (off by default; "the agent can't turn it on"), a background drag that starts an AppKit drag-and-drop session is repeated in the foreground. The driver then checks that the frontmost app and the pointer were restored, and reports `foreground_step {used, reason, allowed_by, restored_frontmost, restored_pointer}`. An explicit `delivery_mode:"background"` is never escalated. — [PR #5481](https://github.com/trycua/cua/pull/5481)
  - **Pointer kept out of window screenshots** (#5480). ScreenCaptureKit's default `showsCursor = true` with a desktop-independent window filter captures the union of the window and the pointer and shrinks it into the frame. In one measured case a 1240x900 Chrome window was drawn at about 96.5% and 31 px lower, and clicks landed about 37 px off. Fix: `showsCursor = false`. — [PR #5480](https://github.com/trycua/cua/pull/5480)
  - **Locked screen and display awake** (#5483). On macOS 14+, the screen saver and display dim lock the session (`CGSSessionScreenIsLocked`=1, `loginwindow` frontmost, empty `AXWindows`). A new `screen_locked` refusal is read fresh from `CGSessionCopyCurrentDictionary` on every gate. `get_window_state` reports `escalation.recommended: "wait_for_unlock"`. Each tool call holds an IOKit `PreventUserIdleDisplaySleep` assertion, released 10 minutes after the last call (`CUA_DRIVER_KEEP_DISPLAY_AWAKE=<seconds>`). — [PR #5483](https://github.com/trycua/cua/pull/5483)
  - **Batch pacing** (#5487). The profile covered 63 runs of 21 tasks with Claude Code driving Cua Driver 0.36. Median tool time was 41 s against 49 s of model time. Per call: click 1.35 s, set_value 1.57 s, type_text 1.18 s, scroll 2.4 s, press_key 0.47 s. Most of a click was the agent cursor's glide (550-880 ms) plus a 300 ms window watch; an AX press alone takes 78 ms. 22% of script calls ended in an exception. Change: inside `run_steps`/`run_script`, waits are capped at 120 ms for the cursor and 100 ms for window change (the last step keeps full waits), and after three single actions in a row the agent is told to batch. — [PR #5487](https://github.com/trycua/cua/pull/5487)
  - **Guidance where agents look** (#5491). Agents "never loaded" the skill, so `cua-driver mcp-config --client <agent>` now installs the skill pack (Claude Code, Codex, Cursor, OpenClaw, OpenCode, Hermes, Antigravity, Pi, Prime Agent). A new read-only MCP tool `get_guide({topic})` covers `overview|drag|browser|permissions|batching|menus` and is compiled into the binary. The macOS MCP instructions are capped at 200 words. — [PR #5491](https://github.com/trycua/cua/pull/5491)
  - Also: target focus is verified before keys, retrying every 10 ms for up to 200 ms, else `target_focus_unconfirmed` / effect `refused` (#5372, [PR](https://github.com/trycua/cua/pull/5372)); the desktop point ratio comes from the display mode, not a screenshot (#5340); background menus bound to sibling windows are refused (#5520); direct-capture consent is asked during setup, not over the user's window (#5352); `browser_select` for native HTML select (#5232). — [Release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.37.0)
- **0.38.0** (Oct 21). `cua-sdk` and the proto contract are published "so you can build your own harness" (#5532). DOM click effects are classified with a bounded readback into confirmed, suspected-noop or unavailable; a readback that hits the deadline stays unverifiable (#5586, [PR](https://github.com/trycua/cua/pull/5586)). Unverified macOS window prefetches are retried (#5605). Cursor placement is tracked explicitly instead of inferred from coordinate sign, because negative display coordinates are valid (#5603, [PR](https://github.com/trycua/cua/pull/5603)). Foreground Document text insertion is verified (#5587). The compromised eMudhra intermediates are distrusted (#5622). — [Release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.38.0)
- **Merged after 0.38.0, unreleased:** guard Space-free background window enumeration (#5712, Oct 22); the WindowServer health check treats any app-bundle host as bundled (#5680, Oct 21). — [PR #5712](https://github.com/trycua/cua/pull/5712), [PR #5680](https://github.com/trycua/cua/pull/5680)

**cua (rest of the product)**
- Cua Cloud has ended: `on="cloud"` now stops with "Cua Cloud has ended" (sandbox 0.9.1, Oct 19, #5415); cua-train was removed (#5445). — [Release sandbox-v0.9.1](https://github.com/trycua/cua/releases/tag/sandbox-v0.9.1)
- cua-agent 0.9.1 (Oct 19): the approval server requires a token (#5503); the playground binds to localhost and requires same-origin (#5502); Anthropic 5-series computer-use tool versions are mapped, Bedrock and Vertex ids included (#5138). — [Release agent-v0.9.1](https://github.com/trycua/cua/releases/tag/agent-v0.9.1)
- Cua Spaces (Mac app plus Windows and Linux app; 0.8.0 Oct 14 through 0.13.1 Oct 22). The New UI is on by default (0.9.0). A window can be dragged onto a Space tile to "teleport" it, and files dropped on a tile are sent there (0.9.0). 0.11.0 (Oct 20): "Cua asks before a second agent connects, and before an agent does something risky", "This Mac is your first Space", usage counted in "remote hours". 0.12.0 (Oct 20): per-machine health-check problems, and `cua doctor --machine`. 0.8.0 shows presence cursors over the video. — [0.8.0](https://github.com/trycua/cua/releases/tag/cua-spaces-v0.8.0), [0.9.0](https://github.com/trycua/cua/releases/tag/cua-spaces-v0.9.0), [0.11.0](https://github.com/trycua/cua/releases/tag/cua-spaces-v0.11.0), [0.12.0](https://github.com/trycua/cua/releases/tag/cua-spaces-v0.12.0)

**Codex Computer Use (OpenAI)**
- The official Codex changelog has **no Computer Use entries between Oct 11 and Oct 23**; its newest entry is Oct 14. In-window and adjacent entries cover approval-picker redesigns (iOS 1.2026.272, Oct 7) and recovery guidance when a tool call needs approval the chat's permissions forbid (Codex app 26.1007, Oct 8), both baseline. — [Codex changelog](https://learn.chatgpt.com/docs/changelog)
- Builds seen in user reports during the window: ChatGPT desktop 26.1013.31256 and 26.1013.40934, Computer Use bundle `26.1013.40934`, and helper `Codex Computer Use.app` 26.1013.1001501 (earlier 26.1005.1001425), with the `unified-computer-use` plugin. — [#54585](https://github.com/openai/codex/issues/54585), [#55707](https://github.com/openai/codex/issues/55707), [#46847](https://github.com/openai/codex/issues/46847)
- Mechanism (user reports): agents drive Computer Use through a bundled `@oai/sky` client in `node_repl`, with calls such as `sky.list_apps()`, `sky.get_window({id, app})`, `sky.get_window_state({window, include_screenshot, include_text})`, an index-based `sky.click`, and `sky.press_key({window, key})`. One user asks OpenAI to document what `click` and `press_key` completion guarantees: target resolution, event submission, OS acceptance or app processing. — [#55170](https://github.com/openai/codex/issues/55170), [#55707](https://github.com/openai/codex/issues/55707)
- Browser policy is fail-closed (user report). On Windows, when the current browser URL cannot be determined, Computer Use stops for the turn: "could not determine the current browser URL on Windows with enough confidence to enforce policy". Related reports: #53053, #53099, #56260. — [#55707](https://github.com/openai/codex/issues/55707)
- Approval scopes (user reports): "Allow once", "Allow this conversation" (Notepad was re-prompted three times despite it) and per-app approval. Chat modes "Approve for me" and "Full access": switching to Full access broke Chrome approval until a restart. — [#54585](https://github.com/openai/codex/issues/54585), [#53133](https://github.com/openai/codex/issues/53133), [#54631](https://github.com/openai/codex/issues/54631)
- Remote and cross-device use (user reports): Codex on a MacBook Pro controlling a Mac mini, with a request for a live preview of what the remote agent sees (#56296). In ChatGPT Work Cloud mode the Mac is the execution environment, but the approval prompt shows only on the Mac, not on the iPhone (#53176). — [#56296](https://github.com/openai/codex/issues/56296), [#53176](https://github.com/openai/codex/issues/53176)
- Overlay lifecycle is still broken (user reports). #46847 (orphaned cursors) remains open with no maintainer reply as of its Oct 19 update; a commenter notes the stray cursor vanishes when a macOS screenshot starts, so it is excluded from capture. New: #53944 (Oct 14), "arrow ghosts with a gray halo" accumulate on the display after actions while absent from the tool's screenshots. #55540 (Oct 20): a cursor marker stays over a Chrome tab after "stop computer use" is acknowledged. — [#46847](https://github.com/openai/codex/issues/46847), [#53944](https://github.com/openai/codex/issues/53944), [#55540](https://github.com/openai/codex/issues/55540)
- Feature requests filed in the window: native Linux Computer Use (#54817), customizable cursor colour, size and shape (#54711). Windows capture timeouts are frequent (Windows.Graphics.Capture `CreateForMonitor` 0x80070057, FrameArrived timeouts), and Windows Computer Use runs inside "MXC". — [Issue search](https://github.com/openai/codex/issues?q=%22computer+use%22+created%3A%3E%3D2026-10-11), [#54690](https://github.com/openai/codex/issues/54690), [#53650](https://github.com/openai/codex/issues/53650)

**Claude Code CLI (2.1.299 Oct 14 to 2.1.309 Oct 22)**
- No computer-use feature changes appear in the CHANGELOG for 2.1.299-2.1.309. The only mention is 2.1.307 (Oct 21): when the WebSearch budget is used up, Claude is told not to query search engines "in a browser or through computer use". — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md), [Releases](https://github.com/anthropics/claude-code/releases)
- MCP-host changes that bear on an MCP server. 2.1.299 (Oct 14): first-party Anthropic MCP servers' tool descriptions and server instructions now reach Claude in full "instead of being cut at 4,096 characters", so third-party servers are still cut at 4,096 by default. An earlier release raised that cap from 2,048 and added `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` (baseline). 2.1.299 also has cloud-session and Remote Control MCP connectors negotiate protocol 2026-07-28 by default. 2.1.302 (Oct 16) fixed servers that negotiate 2026-07-28 but omit `resultType`, `ttlMs` or `cacheScope` showing no tools. 2.1.304 (Oct 19) turned tool search on by default behind a custom `ANTHROPIC_BASE_URL`. — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- Current CLI computer-use docs **confirm the baseline still holds**: macOS only, Pro/Max, research preview; a built-in `computer-use` MCP server enabled per project in `/mcp`; per-session app approval with sentinel warnings (shell-equivalent, any-file, system-settings); tiers (browsers and trading view-only, terminals and IDEs click-only); one session-wide lock, released on exit or when the holder's process is gone; other apps hidden and restored at end of turn; terminal excluded from screenshots; Esc consumed. New detail: screenshots are always downscaled (3456x2234 to about 1372x887) and the size cannot be changed. — [Claude Code computer use docs](https://code.claude.com/docs/en/computer-use)

**Claude Desktop (Claude app changelog, the "Cowork" page)**
- v2.37337.1 (Oct 13): "Fixed computer use in the background taking your keyboard: a dropdown menu that a click or key opens in a background app is now closed again at once instead of swallowing what you type." — [Claude app changelog](https://claude.com/docs/cowork/changelog)
- v2.42304.0 (Oct 15). Computer use on macOS no longer saves into hidden or protected folders (Homebrew's folders, shell start-up locations) or gives a document a hidden or protected name. It no longer types text twice into a busy web page in a background app. Tool approval prompts no longer stay hidden behind a full-screen MCP app. `mcpPersistentAlwaysAllowEnabled=false` offers "Allow for this session" instead of "Always allow". — [Claude app changelog](https://claude.com/docs/cowork/changelog)
- v3.6556.1 (Oct 22). Screen readers now name the apps and access in a computer-use request. "MCP tools that their server marks as needing a person" are asked only on the in-app card, and scheduled tasks skip those calls. Claude can press Return, Delete and arrows, rotate, and toggle the on-screen keyboard in the iOS Simulator pane. `quickEntryScreenshotsEnabled` and `quickEntryFileSharingEnabled` are admin switches. — [Claude app changelog](https://claude.com/docs/cowork/changelog)
- Baseline (Oct 1-8): computer use removed on macOS 13 and earlier (requires 14+); background fixes for Slack-like apps, Keynote menu commands and canvas drags; no editing of hidden dotfiles; "text is no longer reported as typed when nothing was"; menu commands not reported disabled after a briefly busy app. — [Claude app changelog](https://claude.com/docs/cowork/changelog)
- Claude API: no new computer-use tool version or computer-use release note between Oct 11 and Oct 23. Baseline: Sep 28, Sonnet 5.5 rejects `computer_20251124` on the Claude API and Google Cloud. Oct 7: Haiku 5.5 requires `computer_toolset_20260801` there, and the Python/TS SDKs gained beta classes for the browser-use and computer-use tools with URL/file policies and an approval callback. — [Claude platform release notes](https://platform.claude.com/docs/en/release-notes/overview)

**Hermes Agent (NousResearch)**
- **v0.22.0 "The Threshold Release"** (tag Oct 14 03:21 UTC; notes dated Oct 13) — [Release v0.22.0](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.0)
  - "Bot Screen": a bot on a Linux gateway can have its own desktop, streamed live in Hermes Desktop. At a login, 2FA or CAPTCHA "you take the screen, finish the step yourself, and hand control back". With Docker, SSH or Singularity backends, the screen, computer use and browser run inside the sandbox.
  - `computer_use` and other rare tools sit behind `tool_search` by default: desktop schemas dropped from 13,367 to 6,883 tokens (#97979).
  - Unchanged `computer_use` screens are not resent (#98954). The PR (merged Sep 14) keeps a per-session sha256 of each capture. An identical capture returns its text metadata, element index included, with a "screen unchanged" note and no image. A streak cap re-delivers, and the digest resets at compaction. It is a port of openclaw#129924. — [PR #98954](https://github.com/NousResearch/hermes-agent/pull/98954)
  - Plugins can now ship the computer-use driver (#118909); element clicks work again on cua-driver 0.21+ (#111313).
- Patches v0.22.1 (Oct 14) through v0.22.5 (Oct 23) contain no computer-use items by keyword search. — [Releases](https://github.com/NousResearch/hermes-agent/releases)

### Inferences
- cua's 0.36-0.38 run reads like a response to a benchmark of Claude Code driving it: it fixes agents stopping at the first refusal (`next_call`), slow batched steps, and agents never reading the skill (`get_guide`). Every fix is a contract change at the dispatch seam, not per-tool work, which makes them cheap to copy.
- The cua screenshot bug (#5480) is a ScreenCaptureKit default that computer-use-mcp's helper already overrides (`config.showsCursor = false`, `libexec/macos-agent-helper.swift:112`), so that defect does not apply here.
- Peekaboo's "Device Control and Data Access" rename is a macOS 27 fact that touches `doctor`, the permission errors and the AGENTS.md/README Cursor guidance, all of which say "Accessibility".
- Codex's overlay still leaks after stop (two new reports in the window), so the 7.6.1 status card's pid-watching close keeps differentiating this server, provided it is tested for "stop then nothing left on screen".

### Gaps
- No OpenAI primary source documents Codex Computer Use behaviour changes in the window; everything Codex-specific beyond the changelog is user-reported and unconfirmed by OpenAI.
- Not verified: whether the cua #5307 key-window primer works on real hardware (the PR says no VM check was run), and whether any Claude Desktop computer-use change landed outside the changelog page (only its first 100k characters were read; the in-window entries were at the top).
- Hermes' computer-use backend changes inside its desktop app (as opposed to release notes) were not inspected.

## Q2. Any new entrants or major updates from other hosted/closed agents with desktop control, other macOS MCP servers, or Apple's agent APIs?

### Takeaway
No major new desktop-control entrant shipped in the window. Google's Gemini Desktop "Tasks" computer use is in
trusted-tester testing, with per-app allow and deny and a reported "Full Access" switch; it is unconfirmed by Google.
Microsoft's Oct 7 Windows announcement (baseline) made Execution Containers (MXC) generally available, and Codex
already runs inside them. Perplexity's "Personal Computer" Mac agent exists but its dates conflict across sources. The
other open macOS MCP servers (macos-automator-mcp, mcp-server-macos-use) were dormant. Apple has published nothing new
on agent-facing macOS APIs since its June App Intents announcement.

### Cited Findings
- **Google Gemini**
  - TestingCatalog reports an "Additional sandbox options" setting in Gemini Desktop's computer-use section, and an Oct 5 follow-up describes a possible "Full Access" permission found in a recent build that may never ship. Reported safeguards: per-app allow or block, and copying selected folders to Google Drive before a task. Windows followed the Mac app on Sep 11. — [TestingCatalog](https://www.testingcatalog.com/gemini-desktop-to-get-broader-computer-use-permissions/)
  - Google's Mac page requires Apple Silicon and macOS 15+. — [gemini.google/mac](https://gemini.google/us/mac/?hl=en)
  - The Gemini agent for work (Oct 8, baseline) is a cloud agent, not local desktop control. — [TechCrunch, Oct 8](https://techcrunch.com/2026/10/08/google-brings-agentic-ai-to-gemini-starting-with-businesses/)
  - Computer use became a built-in tool in Gemini 3.5 Flash (baseline, June 2026). — [Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-computer-use-gemini-3-5-flash/)
- **Microsoft** (baseline, Oct 7)
  - "Building Windows for hybrid intelligence" makes Microsoft Execution Containers (MXC) generally available on Windows 11, with org-defined file and network access for agents enforced at runtime. Agents already listed: Codex, GitHub Copilot, OpenClaw, Replit, LM Studio, NVIDIA OpenShell, Unsloth. Copilot actions on local files and Windows are "in the coming months". This is from search-result text; the page was not fetched. — [Windows Experience Blog](https://blogs.windows.com/windowsexperience/2026/10/07/building-windows-for-hybrid-intelligence/)
  - Codex Windows issues in the window name MXC permission-path failures, consistent with Codex Windows Computer Use running in MXC. — [#53650](https://github.com/openai/codex/issues/53650), [#53907](https://github.com/openai/codex/issues/53907)
  - Copilot Studio computer-using agents are GA, with human-in-the-loop checkpoints for low-confidence steps. Date not confirmed in the window. — [Microsoft Tech Community](https://techcommunity.microsoft.com/blog/copilot-studio-blog/computer-using-agents-in-microsoft-copilot-studio-are-now-generally-available/4519427)
- **Perplexity**
  - Perplexity's "Personal Computer" Mac agent hands web tasks to Comet. — [Perplexity setup page](https://www.perplexity.ai/personal-computer-setup)
  - One aggregator says it operates Mac apps through Apple accessibility APIs, logs every action, makes actions reversible and has a kill switch. Launch dates conflict (April vs May 2026), and none of it is in the window. — [ai-tldr.dev](https://ai-tldr.dev/releases/perplexity-personal-computer-mac-ga/)
- **Manus, OpenAI Operator/agent mode:** searches found nothing in the window.
- **OpenClaw** (openclaw/openclaw; 392,857 GitHub stars on Oct 23; Peekaboo and AXorcist now live in this org). Releases 2026.10.4 (Oct 16), 2026.10.5 (Oct 18) and 2026.10.6 (Oct 22). Notes mention macOS companion execution (long command and approval deadlines across the companion socket) and Gateway recovery after sleep; no computer-use feature lines were found. — [Release 2026.10.5](https://github.com/openclaw/openclaw/releases/tag/v2026.10.5)
- **Other macOS MCP servers (dormant):**
  - `steipete/macos-automator-mcp`: last release v0.4.7 (Sep 1), last push Sep 13. — [Releases](https://github.com/steipete/macos-automator-mcp/releases)
  - `mediar-ai/mcp-server-macos-use`: only v0.1.0 (Mar 10), last push Sep 30. — [Repo](https://github.com/mediar-ai/mcp-server-macos-use)
- **Apple** (baseline, June 2026). The newsroom post says updated App Intents connect apps to Siri's personal context, app actions and onscreen awareness, and highlights agentic coding in Xcode 27. Earlier reporting puts MCP support in the iOS/macOS 26.1 betas (secondary). — [Apple Newsroom, June 2026](https://www.apple.com/newsroom/2026/06/apple-aids-app-development-with-new-intelligence-frameworks-and-advanced-tools/)
  - The only in-window, Apple-platform fact found is the macOS 27 rename of the Accessibility privacy row to "Device Control and Data Access". — [Peekaboo v4.9.4](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.4)
- **MCP Apps:** the `modelcontextprotocol/ext-apps` SDK's latest release is v2.0.3 (Sep 25); v2.0.0 was Sep 8. Nothing shipped in the window. — [ext-apps releases](https://github.com/modelcontextprotocol/ext-apps/releases)
  - Claude Desktop renders full-screen MCP apps (implied by its Oct 15 fix for approval prompts hidden behind one). — [Claude app changelog](https://claude.com/docs/cowork/changelog)

### Inferences
- The competition that matters for a macOS MCP server is still Peekaboo and cua-driver (open) plus the closed Codex and Claude engines. The hosted entrants are converging on the same controls: per-app allow and deny, scoped approvals and a stop control. None of them published a new mechanism in the window.
- Containment is moving into the OS on Windows (MXC). On macOS nothing comparable exists, so the process-level guards (user-active guard, status card, policy) remain the only containment for a macOS MCP server.

### Gaps
- Microsoft's Oct 7 blog was cited from search-result text, not fetched; the MXC agent list and the GA status should be confirmed on the page.
- Gemini Desktop Tasks/Full Access, Perplexity's dates and Copilot Studio's GA date come from secondary sources.
- No reliable source was found on Apple macOS 27 agent APIs beyond App Intents, or on whether macOS 27 exposes MCP to third-party agents.

## Q3. How do they compare on background input, capture, AX, OCR/vision, set-of-marks, verification/receipts, multi-cursor, takeover/pause/stop, approvals, MCP Apps/UI and schema token efficiency?

### Takeaway
On background input and honest effect reporting, cua-driver is now ahead of everyone, computer-use-mcp included. It
posts per process through SkyLight with window routing, refuses rather than fakes AppKit drag-and-drop, attaches
`next_call`, classifies effects as confirmed, unverifiable, suspected-noop or refused, and detects a locked screen.
On token efficiency the move is to defer computer-use tools behind tool search (Hermes, Claude Code) and to drop
unchanged screenshots (Hermes, OpenClaw). On human control the leaders are Claude's consumed Esc, Hermes' take-the-screen
handoff and cua Spaces' prompt before a second agent connects, while Codex's overlays still leak.

### Cited Findings
- **Background (no-focus) input**
  - cua: SkyLight `SLEventPostToPid` with routing fields, cursor never warped, front app and key window restored (#5309). Background menus via a key-window primer and off-Space reads (#5307). Electron background drag through the main process (#5351). Focus confirmed before keys (#5372). — [PR #5309](https://github.com/trycua/cua/pull/5309), [PR #5307](https://github.com/trycua/cua/pull/5307), [0.37.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.37.0)
  - Claude Desktop: background-mode fixes for dropdowns that swallow typing and for double typing (Oct 13/15). — [Claude app changelog](https://claude.com/docs/cowork/changelog)
  - Peekaboo: exact-window background drag and scroll (baseline 4.9.0). — [Releases](https://github.com/openclaw/Peekaboo/releases)
  - computer-use-mcp: `delivery:"pid"` on `key`, `type`, the click tools, `scroll` and `click_text`, but not on `mouse_drag`. — [AGENTS.md](AGENTS.md)
- **Capture**
  - cua and computer-use-mcp both use ScreenCaptureKit window capture with `showsCursor=false`; cua made that fix on Oct 19. — [PR #5480](https://github.com/trycua/cua/pull/5480); [helper source](libexec/macos-agent-helper.swift)
  - Claude Code downscales whole-screen captures to about 1372x887. — [Claude Code docs](https://code.claude.com/docs/en/computer-use)
  - Codex's `get_window_state` can return text without a screenshot (`include_screenshot:false, include_text:true`; user report). — [#55707](https://github.com/openai/codex/issues/55707)
- **AX tree, OCR and vision**
  - cua: `semantic_v2` keeps rendered controls and reports `not_rendered` for background tabs (#5256). — [0.37.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.37.0)
  - Peekaboo: route-specific AX needs (#1088); `see`/`analyze` take a configurable LLM vision model (#1110). — [4.9.5](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.5), [4.9.6](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.6)
  - Hermes: `computer_use` results carry an element index (from the dedup PR). — [PR #98954](https://github.com/NousResearch/hermes-agent/pull/98954)
  - No competitor in the window announced on-device OCR comparable to computer-use-mcp's Apple Vision tools (`read_window_text`, `click_text`, `wait_for_text`). — [AGENTS.md](AGENTS.md)
- **Set-of-marks:** nothing new found in the window from any product; the index-based clicks in Codex (`sky.click`) and Hermes are the nearest equivalents. — [#55170](https://github.com/openai/codex/issues/55170)
- **Verification and receipts**
  - cua: `ActionResult.effect` values `unverifiable`, `suspected_noop`, `refused`, with `hint` and `next_call` (#5493); DOM click readback with deadline (#5586); verified foreground Document insertion (#5587). — [PR #5493](https://github.com/trycua/cua/pull/5493), [PR #5586](https://github.com/trycua/cua/pull/5586)
  - Peekaboo: no-op classification for `app quit` (#1098); `window close` postconditions (#1116, #1109); signed receipts and the "unverified effect" wording are baseline. — [4.9.5](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.5), [4.9.6](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.6)
  - Claude Desktop: "text is no longer reported as typed when nothing was" (Oct 8, baseline). — [Claude app changelog](https://claude.com/docs/cowork/changelog)
  - A Codex user asks OpenAI to document what a completed `click` guarantees, which suggests no published effect contract. — [#55170](https://github.com/openai/codex/issues/55170)
- **Multi-cursor and parallel agents**
  - cua: explicit cursor placement state across platforms (#5603); Linux MPX sessions route a popup's keys through the clicking session's master keyboard (#5652, unreleased); Cua Spaces asks before a second agent connects (0.11.0). — [PR #5603](https://github.com/trycua/cua/pull/5603), [Spaces 0.11.0](https://github.com/trycua/cua/releases/tag/cua-spaces-v0.11.0)
  - Claude Code keeps one lock per machine. — [Claude Code docs](https://code.claude.com/docs/en/computer-use)
  - Codex runs parallel cursors (baseline) and still shows ghost cursors. — [#53944](https://github.com/openai/codex/issues/53944)
- **Takeover, pause and stop**
  - Hermes Bot Screen: take the screen and hand back (v0.22.0). — [Release](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.0)
  - Claude: Esc consumed, Ctrl+C, apps restored. — [Claude Code docs](https://code.claude.com/docs/en/computer-use)
  - Codex: "stop computer use" leaves a marker (#55540). — [#55540](https://github.com/openai/codex/issues/55540)
  - cua: keeps the display awake while working and reports `screen_locked` with `wait_for_unlock` (#5483). — [PR #5483](https://github.com/trycua/cua/pull/5483)
  - computer-use-mcp: status card with Pause/Stop, excluded from capture, closes with the server pid. — [AGENTS.md](AGENTS.md)
- **Approval models**
  - Codex (user reports): Allow once, Allow this conversation, per-app Always allow, plus Approve-for-me vs Full-access modes; fails closed on an unknown browser URL. — [#54585](https://github.com/openai/codex/issues/54585), [#53133](https://github.com/openai/codex/issues/53133), [#55707](https://github.com/openai/codex/issues/55707)
  - Claude: per-session apps, tiers, an admin-switchable "Always allow", and server-marked "needs a person" tools asked only in-app (Oct 22). — [Claude app changelog](https://claude.com/docs/cowork/changelog)
  - cua: an operator-only env opt-in for escalation that "the agent can't turn on" (#5481); owner-authorized self-approval of its own TCC prompts (#5467); a token on the approval server (#5503). — [PR #5481](https://github.com/trycua/cua/pull/5481), [PR #5467](https://github.com/trycua/cua/pull/5467), [agent-v0.9.1](https://github.com/trycua/cua/releases/tag/agent-v0.9.1)
- **MCP Apps and UI**
  - Claude Desktop renders full-screen MCP apps; Claude Code CLI (baseline) does not. — [Claude app changelog](https://claude.com/docs/cowork/changelog)
  - Codex users ask for a live preview of remote sessions (#56296); Hermes streams the bot desktop; Cua Spaces shows presence cursors over video. — [#56296](https://github.com/openai/codex/issues/56296), [Spaces 0.8.0](https://github.com/trycua/cua/releases/tag/cua-spaces-v0.8.0)
- **Token efficiency of tool schemas**
  - Hermes deferral cut desktop schemas from 13,367 to 6,883 tokens, and unchanged screenshots are omitted. — [Release v0.22.0](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.0)
  - cua: macOS instructions capped at 200 words, with guidance moved into `get_guide` (#5491); batching nudges (#5487). — [PR #5491](https://github.com/trycua/cua/pull/5491), [PR #5487](https://github.com/trycua/cua/pull/5487)
  - Claude Code cuts third-party descriptions and instructions at 4,096 chars by default (2.1.299) and turns tool search on by default behind gateways (2.1.304). — [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

### Inferences
- With hosts deferring MCP tools behind search (Claude Code, Hermes), the size of the up-front tool list matters less than the first-line description of each tool and the server instructions. Those must name the routes, because the model may only ever see them.
- cua's `next_call`, batch pacing and lock detection are the cheapest wins: each is one table or one hook at a single seam.

### Gaps
- Codex's capture method and approval data model are not documented publicly; the comparison relies on user reports.
- No product disclosed its tool-schema byte size in the window other than Hermes (tokens) and computer-use-mcp (bytes, from its own docs).

## Q4. Which of these does computer-use-mcp 7.6.1 lack?

### Takeaway
Checked against the repository on Oct 23, computer-use-mcp lacks seven things the field shipped. In order of value
over cost: (1) a generic `hint`/`next_call` on every refusal and unverified result; (2) locked-screen detection plus a
display-awake assertion; (3) the macOS 27 "Device Control and Data Access" naming in `doctor` and the docs; (4) a
batch/step tool with reduced pacing; (5) background (`delivery:"pid"`) drag, with drag-and-drop refused honestly or
done as an opt-in foreground step that verifies the restore; (6) remembered per-app approval scopes; (7) a
take-the-screen handoff, beyond Pause/Stop. Two field defects do not apply here: the SCK pointer bug and the
4,096-character instruction cap.

### Cited Findings
- Already fine, verified:
  - The capture helper sets `config.showsCursor = false` and `scalesToFit = true`, so the cua #5480 distortion does not apply. — [libexec/macos-agent-helper.swift:111-112](libexec/macos-agent-helper.swift)
  - Generated server instructions measure 2,316 (core), 2,351 (desktop) and 2,741 (full) characters on macOS, and 1,597-2,005 on Windows, all under Claude Code's 4,096-character cap. — [src/instructions.ts](src/instructions.ts) (measured with `dist/instructions.js` `buildInstructions`); [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
  - `server/discover` declares `ttlMs: 30_000` and `cacheScope: 'private'`, matching the fields whose absence Claude Code 2.1.302 had to tolerate (whether every 2026-07-28 result carries `resultType` was not checked). — [src/server.ts:182](src/server.ts)
- **Missing, verified by search of `src/`, `native/` and `libexec/`:**
  - No `PreventUserIdleDisplaySleep`/`IOPMAssertion` and no `CGSessionCopyCurrentDictionary`/screen-locked check. On a dimmed or locked Mac, refusals would be misattributed, as cua found before #5483. — [PR #5483](https://github.com/trycua/cua/pull/5483)
  - No occurrence of "Device Control and Data Access"; the docs tell users to enable apps under "Accessibility". — [Peekaboo v4.9.4](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.4); [AGENTS.md](AGENTS.md)
  - No `run_steps`/batch tool among the 77 tools `listedTools('darwin','full')` returns from the built `dist`; cua measured most of each action's latency as fixed waits that batching removes. — [PR #5487](https://github.com/trycua/cua/pull/5487)
- **Partial:**
  - Recovery guidance exists only for some failures (`FocusFailure.suggestedRecovery`, `select_menu_item` `availableMenus`, `find_element` `similarLabels`), not as a uniform `hint` plus a safe-to-run `next_call` on every refusal. — [AGENTS.md](AGENTS.md); [PR #5493](https://github.com/trycua/cua/pull/5493)
  - Effect classes (verified, unverifiable, suspected no-op) were planned as R1 for 7.7 in the 10-11 review and are not listed as shipped in 7.6.1; cua and Peekaboo both ship them. — [2026-10-11 review](docs/reviews/2026-10-11-end-to-end-review.md); [PR #5586](https://github.com/trycua/cua/pull/5586)
  - Screenshot de-duplication: the native `takeScreenshot` accepts `previousHash` and the session records `screenshot_hash`, but whether an unchanged frame omits the image block, as Hermes and OpenClaw do, was not verified. — [src/native.ts:252](src/native.ts); [Hermes PR #98954](https://github.com/NousResearch/hermes-agent/pull/98954)
  - Skills: computer-use-mcp ships `skills/` for manual copying; cua installs its skill pack per agent during `mcp-config` and exposes `get_guide(topic)`. computer-use-mcp's `get_tool_guide(task)` covers part of that. — [PR #5491](https://github.com/trycua/cua/pull/5491); [AGENTS.md](AGENTS.md)
- **Missing per documentation (not code-audited):**
  - Background drag: `delivery:"pid"` is documented for key, type, click, scroll and click_text only. — [AGENTS.md](AGENTS.md); [PR #5309](https://github.com/trycua/cua/pull/5309)
  - Background menu commands via a key-window primer, and reading web pages on another Space. — [PR #5307](https://github.com/trycua/cua/pull/5307)
  - A verified, operator-only brief foreground step that reports `restored_frontmost`/`restored_pointer`. — [PR #5481](https://github.com/trycua/cua/pull/5481)
  - Remembered approval scopes (once, this conversation, always, per app), as in Codex and Claude, and a URL-based browser policy that fails closed (Codex). — [#54585](https://github.com/openai/codex/issues/54585), [#55707](https://github.com/openai/codex/issues/55707), [Claude Code docs](https://code.claude.com/docs/en/computer-use)
  - A human "take the screen, hand back" flow (Hermes Bot Screen) and a remote live view (Codex request #56296, Cua Spaces). The run console shows captured frames, but the HTTP runner is loopback-only. — [Hermes v0.22.0](https://github.com/NousResearch/hermes-agent/releases/tag/v0.22.0); [AGENTS.md](AGENTS.md)
  - Capture and inspection of apps that re-exec themselves (PID -1), as Peekaboo 4.9.6 handles. — [v4.9.6](https://github.com/openclaw/Peekaboo/releases/tag/v4.9.6)
  - Guarding against non-finite window bounds from macOS in `list_windows` (cua #5125). — [0.35.4](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.35.4)

### Inferences
- Ranked by value over cost:
  1. `hint`/`next_call` at the dispatch seam: one table, no per-tool work.
  2. Screen-locked refusal plus a display-awake assertion: one native call each.
  3. The macOS 27 permission naming in `doctor`, errors and docs: text only.
  4. A `run_steps` batch tool with capped waits.
  5. pid-delivered drag with honest `drag_and_drop_session` refusal.
  6. Remembered approval scopes in the policy layer.
  7. A takeover/hand-back mode on the status card.
- Owner-authorized self-approval of TCC prompts (cua #5467) is a deliberate trust trade-off. It fits CI and VM hosts only, and this server's posture ("Never pass `force: true` unless the person asked") argues for leaving it out or gating it behind an operator variable, as cua does.

### Gaps
- Not run on macOS 27; the rename comes from Peekaboo's release notes alone. A check on a macOS 27 machine should confirm the exact Settings string before it goes into `doctor`.
- Not audited in code: whether 7.6.1 omits images for unchanged screenshots, guards non-finite bounds, or handles PID -1 apps. These are marked "not verified" above.
- Tool counts differ: the assignment says 79 tools; `listedTools('darwin','full')` from the current `dist` returns 77 (AGENTS.md says 76 for `full` on macOS before 7.6.1's additions). The run-console tools are additional and were not counted.
