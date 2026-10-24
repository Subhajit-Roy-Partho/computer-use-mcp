# Performance of desktop computer-use agents: published figures and speed/cost techniques (as of 2026-10-23)

Scope: (a) latency, cost, step and success figures that benchmarks and competitors publish; (b) techniques that cut per-action latency, capture time and token/byte cost, so computer-use-mcp (TypeScript MCP server, Rust N-API addon, Swift ScreenCaptureKit helper) can set targets. "Vendor" = self-reported by the party selling the system; "independent" = measured by a third party; "local" = measured or read in this repository on 2026-10-23.

## 1. Published per-action latency, steps-per-task and success rates (benchmarks and vendors)

### Takeaway
Time in a computer-use loop is spent in the model, not on the desktop: in the one independent breakdown (OSWorld-Human), planning and reflection LLM calls take 75-94% of task time, while screenshot capture takes 1.0-3.6% and action execution 0.9-2.3%. Agents also take 1.4-2.7x (later 2.7-4.3x) more steps than a human needs. So the largest savings come from fewer model turns (batching several actions, semantic or API actions) and smaller prompts. Accuracy is high on OSWorld-Verified (top self-reported scores of 83-86% in mid-to-late 2026) and low on the long-horizon OSWorld 2.0 (about 20%). Nobody publishes per-action server latency in milliseconds.

### Cited Findings

**Where the time goes: OSWorld-Human (independent academic study, UCSD; arXiv 2506.16042 v1, June 2025; MLSys 2026 oral)**
- Setup: Agent S2 (50-step cap) on 37 OSWorld tasks (10% of the benchmark); GPT-4.1 for planner, reflection and retrieval; UI-TARS-7B-DPO grounding on one A6000 with SGLang — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- Share of task time: planning 48.9-59.2%; reflection 15.9-45.2%; planning plus reflection 75-94%; retrieval 0.7-8.9%; grounding 3.1-6.1%; **screenshot 1.0-3.6%**; **action execution 0.9-2.3%** (Table 1). LibreOffice Calc example: planning 51.4%, reflection 36.9%, screenshot 1.4%, action 1.3% — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- Each later step can take 3x longer than early steps, because prompts carry the whole history of screenshots, plans and reflections, and planning and reflection latency is dominated by prefill — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- Whole tasks: a 50-step SSH-user task took over 40 minutes. Changing the line spacing of two paragraphs took the agent 12 minutes against under 30 seconds for a typical user — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- Excess steps: the best agents take "1.4-2.7x" more steps than necessary in v1 of the paper; the MLSys 2026 version gives 2.7-4.3x. The two versions conflict — [arXiv v1](https://arxiv.org/html/2506.16042v1); [MLSys 2026 listing](https://mlsys.org/virtual/2026/oral/3865)
- Human step counts (single-action / grouped-action): OS 4.9/3.8, Thunderbird 9.6/8.8, VS Code 6.3/5.1, Writer 9.0/6.1, VLC 6.3/4.8, GIMP 4.6/3.2, Impress 8.5/4.5, Chrome 6.8/5.0, Calc 13.6/5.9. Grouping helps most in documents and spreadsheets — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- Efficiency-weighted scores (success, then single WES+, then grouped WES+): UI-TARS-1.5 (100 steps) 42.5% → 23.7% → 14.3%; Agent S2 with Gemini 2.5 (50 steps) 41.4% → 28.2% → 17.4%; Agent S2 with Claude 3.7 34.5% → 20.0% → 11.4% — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- Accessibility tree cost in the OSWorld (Linux AT-SPI) environment: generating the tree takes **3 to 26 seconds** and adds thousands of tokens per step. Set-of-Mark labelling overhead is negligible, and SoM lowers step counts in several apps (Table 2: GIMP 49 steps with screenshot only, 17 with screenshot plus a11y tree, 12 with SoM added) — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)
- The paper recommends faster planning and reflection calls, fewer steps, grouping actions that can run on one observation, and SoM — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)

**OSWorld-Verified leaderboard (accuracy; all top entries are self-reported)**
- Steel leaderboard, last updated 2026-10-11: Qwen3.8-Max 86.1% (2026-08-03, Alibaba); Claude Mythos Preview 85.4% (100 steps); Claude Mythos 5 85.0% (100); Claude Fable 5 85.0% (100); Claude Opus 4.8 83.4% (2026-05-28, 100); MiMo-V2.6-Pro 82.0%; Claude Sonnet 5 81.2% (100); MiMo-V2.6-Flash 80.8%; Claude Sonnet 4.6 78.5%; OSAgent 76.26% (2025-10-23). None of the top 10 is marked independently verified. Anthropic's 2026 scores use a revised harness and are "not directly comparable to older entries" — [Steel OSWorld leaderboard](https://leaderboard.steel.dev/leaderboards/osworld/)
- BenchLM (2026-10-20) also puts Qwen3.8 Max first at 86.1%. Presenc AI reports that the official board's top entry is "Intelligence-Indeed Agent" at 90.19% (dated 2026-07-25). I could not confirm this: the official page loads its data dynamically and showed only "Loading verified benchmark data..." — [BenchLM](https://benchlm.ai/benchmarks/osworld-verified); [Presenc AI](https://presenc.ai/research/osworld-computer-use-leaderboard-2026); [official OSWorld page](http://osworld-v1.xlang.ai/)
- One aggregator says the best independently measured result is Muse Spark Open at 80.4%, against 85.0% provider-reported for Claude Fable 5 (aggregator search summary, not verified) — [respan.ai](https://www.respan.ai/models/benchmarks/osworld-verified)
- Human baseline: 72.36% (original OSWorld paper). The OSWorld-Verified upgrade (2025-07-28) brought evaluation time down to "within 1 hour" on AWS — [OSWorld site](http://osworld-v1.xlang.ai/)
- Agent S3 (Simular, vendor): 66% at 100 steps alone, 72.6% with Behavior Best-of-N (several full rollouts run in parallel and judged), above the ~72% human level. A Simular Chinese-language article gives 69.9% instead; the figures are unreconciled. No wall-clock or cost figure for best-of-N was found — [gui-agents on PyPI](https://pypi.org/project/gui-agents); [Simular article](https://www.simular.ai/zh/articles/agent-s3)

**OSWorld 2.0 (long horizon; released 2026-06-26)**
- 108 long-horizon tasks across 7 professional domains. Skilled humans take a median of about 1.6 hours, and 69.6% of tasks take more than an hour — [OSWorld 2.0](https://osworld-v2.xlang.ai/)
- Results (binary completion at 500 steps): Claude Opus 4.8 (max thinking, **batched tool calls**) 20.6% binary / 54.8% partial with ~244K output tokens; Claude Opus 4.7 (max thinking) 18.2% with ~150K output tokens; GPT-5.5 ~14% with ~39K output tokens — [OSWorld 2.0](https://osworld-v2.xlang.ai/)
- Opus 4.7 averages about **318 tool calls per task** (about 30 on OSWorld 1.0), and agents average more than 250 steps — [OSWorld 2.0](https://osworld-v2.xlang.ai/)
- Naming conflict: an aggregator lists an "OSWorld-Verified 2.0" board with Claude Opus 5 first at 31.4% (2026-10-07). It is unclear whether this is the same benchmark — [benchleader](https://www.benchleader.com/benchmarks/osworld_2)

**Grounding: ScreenSpot-Pro**
- BenchLM: GPT-6 Astra 92.7%, Claude Opus 4.8 87.9%. Its 2026-07-29 snapshot had Opus 4.8 87.9%, GPT-5.4 85.4%, Gemini 3.1 Pro 84.4%. BenchLM warns that cropping, visual search and Python tools change results without any change to the model — [BenchLM ScreenSpot-Pro](https://benchlm.ai/benchmarks/screenspot-pro); [BenchLM md](https://benchlm.ai/md/benchmarks/screenspot-pro.md)
- Another aggregator: 93% top score with tools, 79.3% without — [benchmarklist](https://benchmarklist.com/benchmarks/screenspot_pro/)

**Windows (WindowsAgentArena) and macOS**
- UFO2 (Microsoft, arXiv 2504.14603, April 2025), WAA success / OSWorld-W success: UFO2 with o1 30.5% / 32.7%; UFO2 with GPT-4o 27.9% / 28.6%; Operator 20.8% / 14.3%; NAVI 13.3% / 10.2%. Setup: 8-core Ryzen VMs, 30-step cap, 154 WAA tasks — [UFO2 paper](https://arxiv.org/html/2504.14603v2)
- macOSWorld: proprietary computer-use agents above 30% success, open-source lightweight models below 5% — [macOSWorld arXiv 2506.04135](https://arxiv.org/pdf/2506.04135v4)

**What vendors and competitors say about speed**
- Anthropic: no latency figure. The docs list "Latency" as limitation #1 ("might be too slow compared to regular human-directed computer actions"). The current `computer_toolset_20260801` lets the model return several member `tool_use` blocks in one response (a **batch action**), run in order and stopped at the first failure, and the model "typically finishes a batch with `screenshot`". `key` takes `repeat` 1-100 — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- OpenAI: a `computer_call` carries an ordered `actions` array (for example click then type), to be run in order before the client captures the screen. Screenshots are returned with `detail: "original"`. No latency figures. For `gpt-6-astra` the guide recommends code execution (PyAutoGUI or Playwright) over the screenshot-based `computer` tool — [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)
- Google (vendor, 2025-10-07): Gemini 2.5 Computer Use claims "lower latency" than alternatives. The only number is a chart point of about 225 s latency at 70%+ accuracy (Browserbase harness). Each loop iteration is one action plus a new screenshot (no batching stated) — [Google blog](https://blog.google/technology/google-deepmind/gemini-computer-use-model/)
- Windows-MCP (CursorTouch, project claim with no method stated): "typical latency between actions … 0.2 to 0.5 secs". Its `Screenshot` tool skips UI-tree extraction for speed; the tree "is built on demand for every tool call"; 21 tools — [Windows-MCP README](https://github.com/CursorTouch/Windows-MCP)
- Peekaboo (v4.9.6): no published latency figures. Advertises background input delivery. A permissions doc mentions ~2 s default timeouts for window and menu operations, and concurrent window queries and captures when both permissions are granted — [Peekaboo README](https://github.com/steipete/Peekaboo); [Peekaboo permissions doc mirror](https://glama.ai/mcp/servers/@steipete/Peekaboo/blob/8f604587515dc688959776d794c92958e7944d77/docs/permissions.md)
- cua: the cua-driver write-up (2026-04-23) gives no latency numbers; it calls vision mode "Smallest payload, fastest" — [cua blog](https://cua.ai/blog/inside-macos-window-internals)
- OmniParser V2 (Microsoft model card, vendor): 0.6 s/frame on A100 and 0.8 s on one RTX 4090, 60% faster than V1 — [Hugging Face mirror of model card](https://huggingface.co/yuxin111222/OmniParser-v2.0)

### Inferences
- A plausible target for this server: keep its own share of a step (capture plus action plus encoding) at or below the 1-4% OSWorld-Human measured for screenshots and actions. A model turn usually takes seconds, so about 100-200 ms of server time per step is in that range. Below that, server milliseconds matter less than removing whole model turns.
- Vendors have converged on several actions per turn: Anthropic batch actions, OpenAI `actions[]`, Opus 4.8's batched tool calls on OSWorld 2.0, and UFO2's speculative multi-action (section 4). An MCP server that offers one action per tool call forces a model round trip per action unless the host emits parallel tool calls, so a batch tool (`computer_batch`-style) is the matching primitive.
- The a11y-tree figure of 3-26 s (Linux AT-SPI in OSWorld) is the one desktop-side cost large enough to rival model time. Bounding tree walks (depth/time limits, caching, scoping to one window) is worth more than shaving capture milliseconds.
- OSWorld 2.0 (about 318 tool calls per task, about 244K output tokens for the top run) means per-call overhead now multiplies by hundreds: a 100 ms saving per call is 30 s or more per task, and 1K tokens per observation is 300K or more input tokens before caching.

### Gaps
- No vendor (Anthropic, OpenAI, Google, ByteDance UI-TARS, Simular) publishes per-action or screenshot-to-action latency in milliseconds or seconds for desktop use. The Gemini figure is per task on the web.
- The official OSWorld-Verified table could not be read (it renders client-side), so the top entry (86.1% vs 90.19%) is unresolved, and nearly all 2026 scores are self-reported.
- No 2026 WindowsAgentArena or macOSWorld leaderboard numbers were found. UI-TARS-2 speed and step data, and Agent S3 best-of-N wall-clock cost, were not found.
- Peekaboo and cua publish no timing benchmarks. The Windows-MCP 0.2-0.5 s claim has no method.

## 2. Screen and window capture latency by API (macOS, Windows, Linux) and helper-process cost

### Takeaway
On macOS, a one-shot ScreenCaptureKit window capture costs about 90 ms p50 in-process on M-series hardware, and a display capture that includes SCShareableContent enumeration costs about 130 ms. A persistent SCStream delivers frames at the display cadence (~17 ms at 60 fps) after an ~81 ms cold open. Spawning this repo's Swift helper adds about 20 ms per call before any capture work. CGWindowListCreateImage (about 17 ms in a 2020 anecdote) is obsoleted in the macOS 15 SDK. Windows and Linux have no trustworthy one-shot latency figures; only qualitative guidance (Windows Graphics Capture recommended) and old X11 numbers.

### Cited Findings

**macOS**
- `SCScreenshotManager` captures a single frame (`captureImage(contentFilter:configuration:)`); available from macOS 14.0 — [Apple SCScreenshotManager docs](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager.md)
- `CGWindowListCreateImage` was deprecated in macOS 14.0 and is "obsoleted in macOS 15.0 - Please use ScreenCaptureKit instead" (compile error with the macOS 15 SDK; MacPorts worked around it by capping the deployment target at 14) — [MacPorts ticket 70756](https://trac.macports.org/ticket/70756); [MacPorts ticket 71136](https://trac.macports.org/ticket/71136)
- Older baseline (anecdotal, 2020): CGWindowListCreateImage about 17 ms from a native app, against 400 ms-2 s to spawn the `screencapture` CLI — [Parallels forum](https://forum.parallels.com/threads/is-it-possible-to-call-cgwindowlistcreateimage-from-electron-on-mac.351810)
- **sckit-go benchmarks** (independent library, v0.3.0 released 2026-05-07; M-series Mac, 1920x1080, macOS 26.3, in-process):
  - One-shot display capture: p50 132 ms, p95 225 ms, includes SCShareableContent enumeration ("min=130ms avg=151ms p50=132ms p95=225ms")
  - One-shot window capture (SCScreenshotManager + BGRA copy): p50 89 ms, p95 108 ms
  - Persistent stream: cold open p50 81 ms, p95 85 ms ("first call pays ObjC + WindowServer handshake"); `NextFrame` at 60 fps p50 17.4 / p95 18.2 ms; at 30 fps 34.0 / 41.0 ms; at 10 fps 100.9 / 102.0 ms; first frame "typically ... within ~150ms" of opening
  - [sckit-go v0.3.1](https://pkg.go.dev/github.com/LocalKinAI/sckit-go@v0.3.1)
- An Apple Developer Forums thread reports SCStream throttled to about 7 fps with `queueDepth = 1` and a 1/30 s minimum frame interval; no resolution given — [Apple forums 811300](https://developer.apple.com/forums/thread/811300)
- **Local measurement (2026-10-23, Apple M4, macOS 26.2, Node v25.4.0, 25 runs after one warm-up):** `execFile('/usr/bin/true')` p50 0.9 ms, p95 1.0 ms. The compiled `macos-agent-helper` running only its `version` subcommand (process launch, dyld and Swift runtime, no capture): **p50 20.6 ms, p95 23.7 ms, min 19.6 ms**. Script: a local timing script (not committed); helper `~/Library/Caches/computer-use-mcp/macos-agent-helper-3aae5b4d`
- Local code: the helper is launched once per capture or OCR call through `execFile` with `encoding: 'utf8'` and a 32 MB `maxBuffer`, so image data comes back over stdout as text — `src/session/macos-helper.ts` (lines 87-98)
- Peekaboo prefers CGWindowList enumeration and falls back to AX only when needed ("hybrid enumeration") — [Peekaboo permissions doc mirror](https://glama.ai/mcp/servers/@steipete/Peekaboo/blob/8f604587515dc688959776d794c92958e7944d77/docs/permissions.md)

**Windows**
- Magpie (wiki last edited 2025-08-10) recommends Windows Graphics Capture (WGC) as "the most recommended capture method" for compatibility and smoothness. Desktop Duplication needs Windows 10 v2004 for its listed support; GDI is "not recommended due to unstable performance". The page has no latency numbers — [Magpie comparison](https://github.com/Blinue/Magpie/wiki/Comparison-of-capture-methods)
- OBS developers: WGC's main advantage is cross-GPU capture with no user setup; DXGI Desktop Duplication needs OBS on the display's GPU. Duplication exposes dirty rectangles, moved rectangles and per-frame timing — [OBS forum](https://obsproject.com/forum/threads/windows-graphics-capture-vs-dxgi-desktop-duplication.149320)
- Throughput anecdotes: a DXGI duplication library tops out around 130-140 fps on a 180 Hz monitor (self-published); WGC captured all 144 fps when the GPU was idle and about 100 fps at ~50% GPU load (GitHub issue, anecdotal) — [rustcam on PyPI](https://pypi.org/project/rustcam); [Win32CaptureSample issue 82](https://github.com/robmikh/Win32CaptureSample/issues/82)
- Windows-MCP: `WINDOWS_MCP_SCREENSHOT_SCALE=0.5` "quarter[s] the file size"; default UIA connection timeout 2000 ms, transaction timeout 5000 ms — [Windows-MCP README](https://github.com/CursorTouch/Windows-MCP)

**Linux / X11**
- Only old figures exist (2005 xorg list): XShmGetImage took about 1.5 s for 1280x1024 on a driver without accelerated GetImage, about 50 ms after switching to the proprietary NVIDIA driver, and about 8 ms on another NVIDIA card; 1024x768 took 216 ms on an ATI card with the free driver. The cause given is reads from video memory without acceleration — [xorg list](https://lists.freedesktop.org/archives/xorg/2005-April/007276.html); [xorg list reply](https://lists.freedesktop.org/archives/xorg/2005-April/007277.html)
- A VNC server switched large reads to XShmGetImage; CPU during full-screen video fell from 40% to 25% — [TigerVNC commit](https://gerrit.omnirom.org/plugins/gitiles/android_external_tigervnc/+/46fab93cbdc6f114f63279f0268ea3be94cd2922%5E%21)

### Inferences
- Rough macOS budget per one-shot window capture with the current spawn-per-call design: about 20 ms spawn (local) plus about 90 ms SCK capture (sckit-go, in-process) plus encode and base64 over stdout, so roughly 110-150 ms before JPEG/PNG encoding. A long-lived helper (stdin/stdout or socket protocol) would remove the ~20 ms spawn and could cache `SCShareableContent` across calls; the gap between the 132 ms display capture (with enumeration) and the 89 ms window capture suggests enumeration is a material share, though the two numbers are not a controlled comparison. A long-lived helper would also make the cross-server `helper.lock` serialisation (AGENTS.md, 7.6) cheaper to hold.
- `wait_for_stable` and `wait_for_text` poll with repeated captures. A persistent SCStream on the target window (81 ms open, then a frame every 17-100 ms by configured rate) is the better primitive than N one-shot captures at about 90 ms or more each, provided the 7 fps throttling report does not apply.
- Returning binary image data over a pipe or shared file instead of utf8 stdout would avoid base64 inflation (about 33%) and the 32 MB buffer ceiling.
- Windows target: use WGC per-window (GraphicsCaptureItem for an HWND) as the default. Desktop Duplication's dirty rectangles are a cheap "did anything change" signal for wait-for-stable-style tools.

### Gaps
- No published, controlled measurement of SCScreenshotManager vs CGWindowListCreateImage on macOS 15 or 26, or of SCScreenshotManager region capture (`captureImage(in:)`) cost.
- No one-shot WGC or DXGI latency in milliseconds (first frame after creating a capture item) was found; only throughput anecdotes.
- No figures found for PipeWire / xdg-desktop-portal screencast latency, or for current X11 XShm on modern drivers.
- Not measured locally: a real helper `capture` call. It would capture the user's screen, so it was skipped. It should be measured in the repo's benchmark harness (`benchmarks/compare.mjs` exists) with permission.

## 3. Token and byte cost reduction (tool lists, screenshots, a11y trees, OCR, history management)

### Takeaway
For Claude, image tokens depend only on pixel dimensions (⌈w/28⌉×⌈h/28⌉ visual tokens). JPEG/WebP quality changes bytes and request latency, not tokens, so downscaling and cropping (zoom or region) are the token levers and compression is the byte lever. Tool-definition overhead is the other large fixed cost: Anthropic's own computer toolset is about 4,500 tokens; this server's default profile is about 12k tokens and its `full` profile about 84 KB; deferred tool loading or tool search cut a 77K-token tool library to 8.7K. History management (keep the last ~3 screenshots, prune in batches every 25 turns to protect the prompt cache) is the host's job, so the server should make each observation small.

### Cited Findings

**Image token arithmetic and limits (Anthropic, current docs)**
- Claude tokenises images in 28x28 patches: cost = `⌈width/28⌉ × ⌈height/28⌉` visual tokens. High-resolution tier (Claude 4.7 and later): max long edge 2,576 px and 4,784 visual tokens. Standard tier: 1,568 px and 1,568 visual tokens. Examples: 1000x1000 = 1,296 tokens; 1920x1080 = 2,691 (high-res tier) or 1,560 after downscaling to 1456x819 (standard tier); 3840x2160 = 4,784 (high-res tier). High-resolution can use "roughly three times more visual tokens" — [Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Pricing examples from the same page: Opus 5.5 at $4 per million input tokens, so a 1000x1000 image is about $5.18 per thousand images and a 4K image about $19.14 per thousand — [Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Compression: lossy JPEG or WebP "can reduce latency by reducing the size of requests" but can introduce artifacts, especially with several compression passes; heavy JPEG makes text hard to read. Base64 images are resent in full on every turn, which "can significantly increase request size and latency"; the Files API (`file_id`) keeps payloads small — [Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Computer use: screenshots are "roughly 1,000-1,800 input tokens each". Recommended display sizes: 1024x768 or 1280x720 for desktop tasks, 1280x800 or 1366x768 for web apps; avoid above 1920x1080. The toolset rejects oversized screenshot and zoom images instead of downscaling them. On Retina, downscale by 2x or halve the returned coordinates — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- Unit conflict: the computer-use page states the earlier-model limit as "approximately 1.15 megapixels", while the vision page states 1,568 visual tokens (about 1.23 MP at 784 px² per token) — [computer use docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool); [vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Many-image requests: above 20 images in one request, a stricter per-image limit applies to every image (keep each side ≤ 2000 px, or keep ≤ 20 images) — [Anthropic vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)
- Best-practices post (Anthropic, 2026-05-13, OSWorld-Verified): 1280x720 is "about 80% of the pixel budget" on the 4.6 family; start at 1080p on Opus 4.7; avoid resolutions below 960x540; a 16 px checkbox at 3840x2160 "becomes roughly 5px at 1280x720" — [Anthropic best practices](https://claude.com/blog/best-practices-for-computer-and-browser-use-with-claude)
- Zoom: the `zoom` member captures `region: [x0,y0,x1,y1]` at full resolution, scaled to fit the usual screenshot size; coordinates stay in full-screenshot space. On by default in the toolset; disabling it saves about 410 tokens of definition — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- OpenAI returns screenshots with `detail: "original"` to preserve resolution and maps coordinates back if you downscale — [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use)

**Tool-list size**
- Anthropic `computer_toolset_20260801` with default members: about 4,500 input tokens (about 4,590 on Sonnet 5, about 4,520 on other models), including the tool-use system prompt. Earlier versions: 466-499 system-prompt tokens plus about 735 tokens per tool definition — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- Tool Search Tool with `defer_loading` (Anthropic engineering, 2025-11-24, vendor): 50+ MCP tools at about 77K tokens fall to about 8.7K (an 85% reduction). MCP-eval accuracy rose from 49% to 74% (Opus 4) and from 79.5% to 88.1% (Opus 4.5). Programmatic tool calling: 43,588 → 27,297 average tokens (37% less); 20+ tool calls in one code block avoid 19+ inference passes — [Anthropic advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- The toolset accepts `defer_loading` inside `configs` — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- This server today (repo docs, 7.6.x): default `desktop` profile on macOS has 40 tools at about 44 KB on the wire (about 12k tokens); `full` has 76 tools at 84,037 bytes (112,727 before 7.6) — `AGENTS.md`
- Windows-MCP lists 21 tools — [Windows-MCP README](https://github.com/CursorTouch/Windows-MCP)

**History and context management**
- Anthropic defaults: keep the last 3 screenshots and prune every 25 turns so the prompt prefix stays byte-identical between prunes. One cache breakpoint after system and tools plus up to 3 on recent tool results. A cache hit costs 10% of full input price. A 200k context "can fill up in well under 100 screenshots". Server-side compaction example trigger: 150,000 tokens — [Anthropic best practices](https://claude.com/blog/best-practices-for-computer-and-browser-use-with-claude); [computer use docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- For Fable 5.1, Opus 5.5, Sonnet 5.5 and Haiku 5.5, avoid client-side pruning ("removing an earlier screenshot invalidates every later thinking block"); resize to ≤ 2000 px per side and use server-side tool-result clearing — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- Thinking effort (Anthropic, 2026-05-13): Opus 4.7 `high` gets close to the top success rate with about half the output tokens of `max`; Opus 4.7 `low` matches Sonnet 4.6 `max` with about 1/10 the tokens per task — [Anthropic best practices](https://claude.com/blog/best-practices-for-computer-and-browser-use-with-claude)

**Model-side visual token pruning (only for self-hosted models)**
- GUI-KV (arXiv 2510.00536, Oct 2025): 5-screenshot history, 38.9% fewer decoding FLOPs and +4.1% step accuracy on AgentNetBench — [arXiv 2510.00536](https://arxiv.org/abs/2510.00536v1)
- GUIPruner (arXiv 2602.23235, Feb 2026, training-free): 3.4x fewer FLOPs and 3.3x faster vision encoding on Qwen2-VL-2B, keeping over 94% of performance — [arXiv 2602.23235](https://arxiv.org/html/2602.23235v1)
- ReVision (arXiv 2605.11212, May 2026): drops redundant patches across consecutive screenshots; 46% fewer tokens and +3% success with 5 history screenshots on Qwen2.5-VL-7B — [arXiv 2605.11212](https://arxiv.org/abs/2605.11212)

**Structured observations instead of pixels**
- cua-driver offers three observation modes: `ax` (simplified AX tree as a Markdown outline with indexed actionable nodes; no Screen Recording permission needed), `vision` (PNG of the target window only; "smallest payload, fastest"), and `som` (default; AX tree plus screenshot). Element-indexed clicks fire the AX action directly and work on hidden or occluded targets — [cua blog](https://cua.ai/blog/inside-macos-window-internals)
- UFO2 hybrid detection (UIA plus OmniParser-v2, with visual boxes discarded at IoU > 10% against a UIA control): WAA success with GPT-4o rose from 23.4% (UIA only) to 26.6%. After merging, 27.9% and 56.7% of OmniParser detections were dropped as duplicates — [UFO2 paper](https://arxiv.org/html/2504.14603v2)
- OSWorld-Human: a11y trees add "thousands more tokens per step" and 3-26 s of generation; SoM labelling overhead is negligible — [arXiv 2506.16042v1](https://arxiv.org/html/2506.16042v1)

### Inferences
- Token targets per observation (from the 28-px rule): 1024x768 = 37x28 = 1,036 tokens; 1280x720 = 46x26 = 1,196; 1280x800 = 46x29 = 1,334; 1920x1080 = 2,691 on the high-res tier. A 400x300 region crop is 15x11 = 165 tokens, about 8x cheaper than a full 1280x800 frame. `read_window_text` with `region` (text lines) is cheaper still. Default capture width should track the model: ~1280 long edge for the standard tier, up to ~1920 for 4.7+ when fidelity matters.
- JPEG quality does not change Claude's token count; it changes bytes, and base64 bytes are resent every turn. For Claude hosts, prefer moderate JPEG (or WebP) over PNG for full frames, and PNG only for zoomed text, to cut request size and latency. Verify against OCR legibility.
- The 12k-token default tool list is about 2.7x Anthropic's whole computer toolset (about 4.5k). Options: (1) shorten descriptions further and move guidance into `get_tool_guide` (7.6 already did some of this); (2) mark rarely used tools deferrable so hosts with tool search load them lazily; (3) a compact core of about 10-15 tools plus one batch tool. Each 1k tokens removed from a cached prefix saves 10% of that per turn after the first, and 100% on cache misses.
- Since hosts own history (and Anthropic advises against client-side pruning on 5.5-family models), the server's levers are: return no screenshot unless asked; return a cropped or changed-region image after an action instead of a full frame; offer text/OCR or AX-outline observations; and keep result JSON terse (no repeated window lists).
- A "diff since last observation" (changed regions only; Desktop Duplication dirty rects on Windows, image hash per tile on macOS) applies the same idea as ReVision and GUIPruner on the server side, without model changes.

### Gaps
- Anthropic's effort and resolution charts are images; exact accuracy-vs-resolution numbers were not extractable.
- No published head-to-head of JPEG quality levels vs model accuracy for screenshots was found.
- OpenAI's image limits and token formula for `detail: "original"` were not confirmed from primary docs. A third-party claim of 10.24 MP / 6000 px is unverified.
- No measured comparison of AX-outline serialisation formats (Markdown outline vs JSON vs YAML) on tokens or accuracy was found.
- MCP-side tool filtering in hosts other than Anthropic's (Cursor, Codex deferred loading) was not researched in depth. A March 2026 third-party post describes deferred loading and tool search for GPT-5.4 in Codex CLI ([codex.danielvaughan.com](https://codex.danielvaughan.com/2026/03/31/gpt54-computer-use-tool-search-codex-cli/), not fetched).

## 4. Input latency: background posting vs focus-and-send, batching, settle waits

### Takeaway
Batching several actions per model turn is the measured win: UFO2's speculative multi-action cut steps by up to 51.5% on OSWorld-W, and API-plus-GUI actions cut steps by up to 58.5%. Background input avoids activation and settle waits but is app-dependent. On macOS, public `CGEventPostToPid` works for keys and for most AppKit clicks; Chromium needs SkyLight's private `SLEventPostToPid` plus a primer click; canvas apps and games need real HID events. On Windows, posting input messages is unreliable and the recommended routes are UI Automation patterns or SendInput.

### Cited Findings
- UFO2 speculative multi-action (one LLM call proposes several actions, each checked against UIA before running, halting on the first failure): average completion steps on OSWorld-W fell from 13.30 to 7.40 (GPT-4o) and from 6.80 to 3.30 (o1, the "51.5%" claim), with success unchanged or higher (22.4→24.5%, 24.5→26.5%). On WAA: 10.00→8.78 (GPT-4o), 9.95→8.85 (o1). The text says "up to 10%" on WAA, but Table 7 implies about 11-12% — [UFO2 paper](https://arxiv.org/html/2504.14603v2)
- UFO2 GUI+API vs GUI-only on OSWorld-W office tasks: success +6.1 points (GPT-4o) and +8.2 (o1); steps 13.8→12.9 (GPT-4o) and 16.0→6.6 (o1, 58.5% fewer) — [UFO2 paper](https://arxiv.org/html/2504.14603v2)
- Anthropic batch actions: run member blocks in order, stop at the first failure, answer the rest with "Not executed: an earlier computer action in this turn failed."; `disable_parallel_tool_use: true` forces one action per turn. The docs' example inserts `time.sleep(0.5)` after clicks to let the UI update — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)
- OpenAI `actions[]`: execute in order, then capture; "after a short group of actions, return another screenshot so it can check the result" — [OpenAI computer use guide](https://developers.openai.com/api/docs/guides/tools-computer-use); [Azure computer use docs](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/computer-use)
- macOS background delivery (cua-driver write-up, 2026-04-23):
  - `CGEventPost` moves the shared cursor
  - `CGEvent.postToPid` delivers without warping the cursor and works for most apps, but not Chrome
  - Chromium clicks need SkyLight `SLEventPostToPid` (private, loaded with dlopen/dlsym) plus a primer mouse-down/up at (-1,-1) to pass the user-activation gate; right-clicks on web content are still coerced to left-clicks
  - Keyboard needs only `postToPid`
  - "Focus without raise" (yabai pattern) uses `SLPSPostEventRecordTo`
  - Electron AX trees pause when occluded unless the private `_AXObserverAddNotificationAndCheckRemote` is used
  - Canvas apps and games (Blender, Unity) filter per-pid events entirely and need a `cghidEventTap` event after `mouseMoved`, so the app is briefly activated and the cursor warps
  - [cua blog](https://cua.ai/blog/inside-macos-window-internals)
- Apple forums: one developer still had to focus Logic before its open dialog responded to pid-posted events — [Apple forums 724835](https://developer.apple.com/forums/thread/724835). Another reported pid-posted events reaching only the app that owns the menu bar; this comes from a search summary, and which thread it belongs to (possibly [695941](https://developer.apple.com/forums/thread/695941)) was not confirmed. Posting requires Accessibility permission.
- Peekaboo advertises background delivery for "targeted semantic and typed CLI input" when it can resolve the process; mac-cua claims CGEventPostToPid delivery without cursor movement or activation (vendor claims) — [Peekaboo README](https://github.com/steipete/Peekaboo); [mac-cua](https://glama.ai/mcp/servers/hyprcat/mac-cua)
- Windows: posting WM_KEYDOWN/WM_CHAR does not simulate input. It skips the input queue (so hooks and GetKeyState don't see it) and breaks with dead keys and IMEs. Raymond Chen recommends SendInput, and in 2025 recommends UI Automation first, then SendInput — [Old New Thing 2005](https://devblogs.microsoft.com/oldnewthing/20050530-11/?p=35513); [2015](https://devblogs.microsoft.com/oldnewthing/20150925-00/?p=91511); [2025](https://devblogs.microsoft.com/oldnewthing/20250319-00/?p=110979)
- UFO2 runs actions through UIA control APIs and validates each speculative action with UIA before execution — [UFO2 paper](https://arxiv.org/html/2504.14603v2)
- Windows-MCP: 0.2-0.5 s between consecutive actions (project claim, no method) — [Windows-MCP README](https://github.com/CursorTouch/Windows-MCP)
- Anthropic toolset `key` supports `repeat` 1-100, so one action can cover a repeated key instead of N calls — [Anthropic computer use tool docs](https://platform.claude.com/docs/en/docs/agents-and-tools/tool-use/computer-use-tool)

### Inferences
- A `batch` tool that takes an ordered list of actions (click, type, key with repeat, scroll, wait_for_*), validates targets up front, halts on the first failure with per-step results in Anthropic's halt-text style, and returns one optional final capture (or region) matches what Anthropic, OpenAI and UFO2 converged on. It removes one model round trip per extra action, which by section 1 is worth far more than any native-side speed-up.
- Fixed settle sleeps (the docs' 0.5 s after clicks) should become event-driven waits: `wait_for_window`, `wait_for_stable` with a short `quiet_ms`, AX notifications. Activation should happen once per batch, not per action. This server's `delivery: "pid"` avoids activation entirely where the app accepts it, and its `get_app_capabilities` record of what worked is the right place to cache per-app routing (pid vs SkyLight vs HID).
- The private SkyLight route is how competitors make background clicks work on Chromium. It carries macOS-update risk and should sit behind a capability probe with fallback, never be the only route.
- On Windows, UIA patterns (Invoke, Value, Toggle, Selection) are the background-safe, focus-free route. SendInput needs focus. PostMessage should not be relied on for keyboard input.

### Gaps
- No measured activation or focus-switch latency on macOS (NSRunningApplication.activate to frontmost) or Windows (SetForegroundWindow) was found. These should be measured locally.
- No published per-action timing for background delivery vs focus-and-send.
- UFO2's latency section (6.8) was in the unread part of the paper, so per-step seconds were not captured.
- No public figures on interpolated-drag timing (steps vs reliability) were found.

## 5. Concurrency: native calls off the Node event loop, and cancellation latency

### Takeaway
Node-API async work runs `execute` on the libuv worker pool (default 4 threads, settable up to 1024 with UV_THREADPOOL_SIZE) and `complete` on the main thread. Queued work can be cancelled before it starts but not while it runs, so long gestures need a cooperative stop flag inside the native loop. This repo's Rust addon (napi-rs 2) exposes only synchronous functions, so every native call blocks the event loop and every other in-flight MCP request (status, cancellation, pause) for its duration.

### Cited Findings
- `napi_async_execute_callback` must not make Node-API calls that run JavaScript or touch JS objects; those belong in `napi_async_complete_callback`. A thread-safe function's `call_js` runs on the main thread and is how worker threads hand results to JS (`napi_call_threadsafe_function`, N-API 4, Node 10.6) — [Node-API docs](https://nodejs.org/api/n-api.html)
- libuv threadpool: default size 4, raise with `UV_THREADPOOL_SIZE` up to 1024; one global pool shared across loops; `uv_cancel()` on queued work makes its callback receive `UV_ECANCELED` — [libuv threadpool docs](https://docs.libuv.org/en/v1.x/threadpool.html)
- Cancellation only succeeds while the work is still queued; once it has started, `uv_cancel` returns `UV_EBUSY` (from a libuv source excerpt, secondary) — [libuv threadpool source excerpt](https://docs.ros.org/en/api/grpc/html/threadpool_8c_source.html)
- Local code: `native/Cargo.toml` uses `napi = { version = "2", features = ["napi9", "serde-json"] }`; a grep of `native/src` finds no `AsyncTask`, `ThreadsafeFunction`, `impl Task` or `async fn`, so all exported functions run synchronously on the JS thread — `native/Cargo.toml`; `native/src/`
- Local code: helper calls (capture, OCR) already run off-thread as child processes taking an `AbortSignal` — `src/session/macos-helper.ts`
- Repo docs: 7.6.1's Stop trips "the native emergency-stop latch, so a drag or a hold stops mid-gesture"; `hold_key` is capped at 10 s; `run_script` cancellation kills the process tree — `AGENTS.md`

### Inferences
- Move the slow native calls (AX tree walks, which reach 3-26 s on AT-SPI per OSWorld-Human; `mouse_drag` with interpolation; `wait`-like loops; UIA queries) to napi-rs `AsyncTask` (libuv pool) or dedicated threads. Keep the fast ones (key down/up, a single click) synchronous to avoid pool hops. With the default 4-thread pool, fs and crypto work share the pool; a dedicated thread per long gesture avoids starving it.
- Since running work cannot be cancelled through `uv_cancel`, cancellation latency is set by how often the native loop checks a shared atomic flag (the existing emergency-stop latch). Checking between interpolation steps (for example every ≤ 16 ms step) bounds stop latency to about one step. Target: Stop/abort observed within 50 ms during a drag or hold.
- Use a threadsafe function (or a polled status) only for progress or streaming (for example SCStream frames for `wait_for_stable`). Keep results as plain return values otherwise.
- Off-loop execution also lets `control_status` and `notifications/cancelled` be processed during a long native call, which they cannot be today if the call blocks the loop.

### Gaps
- Not verified from primary docs: napi-rs 2 `AsyncTask` support for `AbortSignal` (napi-rs 3 docs not fetched), and the exact Node-API mapping of `UV_EBUSY` on `napi_cancel_async_work`.
- No competitor (Peekaboo, cua, Windows-MCP) publishes how its native calls are scheduled or how fast cancellation is. Event-loop block times in this repo were not measured.
