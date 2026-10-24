import type { NativeModule } from '../native.js'
import { offThread } from './native-async.js'
import { errJson, ok, okJson, type ToolResult, platformUnsupported } from '../result.js'
import { PROVIDER_QUALITY, PROVIDER_WIDTH } from './constants.js'
import type { TargetStateController } from './target-state.js'
import type { VirtualPointerController } from './virtual-pointer.js'
import { resolveAppWindow, WindowSelectionError } from './window-select.js'
import { HelperFailure, type MacosHelper } from './macos-helper.js'

export interface CachedScreenshot {
  mimeType: string
  data: string
  capturedAt: number
  targetArgs?: Record<string, unknown>
}

/** How a point in the last image maps to the screen: screen = origin + image * scale (7.7.0, K2). */
export interface ScreenMapping {
  originX: number
  originY: number
  scaleX: number
  scaleY: number
  imageWidth: number
  imageHeight: number
}

/**
 * 7.7.0 (K3): how many captures in a row may come back as text when nothing changed. Every turn resends its images,
 * so an unchanged frame cost 122-187 KB of base64 and about 1,000 image tokens for nothing; the cap re-sends the image
 * after this many, for a host that dropped the earlier one from context.
 */
export const UNCHANGED_TEXT_REPEATS = 3

/** How a Windows capture was taken, in words (7.7.0, K6). */
const CAPTURE_METHODS: Readonly<Record<string, string>> = {
  print_window: 'the window drew itself (PrintWindow), so it is complete even when covered',
  graphics_capture: 'Windows.Graphics.Capture, the compositor\'s own frame of the window',
  screen_crop: 'cropped from a screen capture',
  bitblt: 'BitBlt of the window, the last resort: GPU-drawn content may be black',
  screen: 'desktop duplication',
}

/** A capture that was cancelled is cancelled: never fall back to a second capture (7.7.0, C7). */
function abortError(signal: AbortSignal | undefined): Error {
  const reason = signal?.reason
  return reason instanceof Error ? reason : new Error('screenshot aborted')
}

/** Screenshot/zoom handler with cache and pointer projection isolated from dispatch. */
export class ScreenshotHandler {
  readonly #native: NativeModule
  readonly #targets: TargetStateController
  readonly #pointer: VirtualPointerController
  readonly #visionEnabled: boolean
  readonly #defaultProvider: string
  readonly #env: NodeJS.ProcessEnv
  readonly #now: () => number
  readonly #helper: MacosHelper | undefined
  #helperFailure: string | undefined
  #lastCaptureScope: string | undefined
  #lastHash: string | undefined
  #lastResult: ToolResult | undefined
  #lastScreenshot: CachedScreenshot | undefined
  /** Unchanged captures returned as text since the image was last sent (K3). */
  #unchangedStreak = 0
  #lastMapping: ScreenMapping | undefined

  constructor(options: {
    native: NativeModule
    targets: TargetStateController
    pointer: VirtualPointerController
    visionEnabled: boolean
    defaultProvider: string
    env?: NodeJS.ProcessEnv
    now?: () => number
    /** v7.5: ScreenCaptureKit window capture (macOS 14+) and OCR helper. */
    helper?: MacosHelper
  }) {
    this.#native = options.native
    this.#targets = options.targets
    this.#pointer = options.pointer
    this.#visionEnabled = options.visionEnabled
    this.#defaultProvider = options.defaultProvider
    this.#env = options.env ?? process.env
    this.#now = options.now ?? Date.now
    this.#helper = options.helper
  }

  /** Why the last ScreenCaptureKit capture fell back to screencapture, if it did. */
  helperFailure(): string | undefined { return this.#helperFailure }

  /**
   * The reply for a capture identical to the last one sent (K3): text instead of the same image again, up to
   * `UNCHANGED_TEXT_REPEATS` times in a row; then the image goes out again. `resend: true` or
   * `COMPUTER_USE_RESEND_UNCHANGED=true` always sends it.
   */
  #unchangedReply(args: Record<string, unknown>): ToolResult | undefined {
    const last = this.#lastResult
    if (!last) return undefined
    const resend = args.resend === true || this.#env.COMPUTER_USE_RESEND_UNCHANGED === 'true'
    if (resend || this.#unchangedStreak >= UNCHANGED_TEXT_REPEATS) {
      this.#unchangedStreak = 0
      return last
    }
    this.#unchangedStreak++
    const mapping = last.content.find(block => block.type === 'text')
    return okJson({
      unchanged: true,
      image_omitted: true,
      hash: this.#lastHash ?? null,
      since: this.#lastScreenshot ? new Date(this.#lastScreenshot.capturedAt).toISOString() : null,
      repeats: this.#unchangedStreak,
      ...(mapping && mapping.type === 'text' ? { mapping: mapping.text } : {}),
      hint: `Nothing changed since your last screenshot of this target, so the image is not sent again (pass resend: true to get it). `
        + `Act on what you saw, or use wait_for_stable or wait_for_text instead of polling. `
        + `After ${UNCHANGED_TEXT_REPEATS} unchanged captures in a row the image is sent again.`,
    })
  }

  #sent(result: ToolResult): ToolResult {
    this.#unchangedStreak = 0
    this.#lastResult = result
    return result
  }

  #captureParams(args: Record<string, unknown>): { width: number; quality: number } {
    const provider = typeof args.provider === 'string' ? args.provider : this.#defaultProvider
    const width = typeof args.width === 'number' ? args.width
      : this.#env.COMPUTER_USE_WIDTH !== undefined ? Number.parseInt(this.#env.COMPUTER_USE_WIDTH)
        : PROVIDER_WIDTH[provider] ?? 1024
    const quality = typeof args.quality === 'number' ? args.quality
      : this.#env.COMPUTER_USE_QUALITY !== undefined ? Number.parseInt(this.#env.COMPUTER_USE_QUALITY)
        : PROVIDER_QUALITY[provider] ?? PROVIDER_QUALITY.default
    return { width, quality }
  }

  /**
   * The window a capture means: explicit id, then target_app (+ title), then the session's.
   * `full_screen: true` wins over all three (7.6.1: it was advertised in 7.6.0 and never read).
   */
  #captureWindow(args: Record<string, unknown>): { windowId?: number; app?: string } {
    if (args.full_screen === true) return {}
    let windowId = typeof args.target_window_id === 'number' ? args.target_window_id : undefined
    const app = windowId ? undefined
      : typeof args.target_app === 'string' && args.target_app.length > 0 ? args.target_app : undefined
    const title = typeof args.target_title === 'string' && args.target_title.length > 0 ? args.target_title : undefined
    if (windowId === undefined && app !== undefined) windowId = resolveAppWindow(this.#native, app, title)?.windowId
    if (windowId === undefined && app === undefined) windowId = this.#targets.observationWindow()
    return { windowId, app }
  }

  /**
   * v7.5 entry point used by the session. A window capture goes through the
   * ScreenCaptureKit helper when it is available: the window alone (even covered,
   * never activated), without its shadow, so the image-to-screen mapping is exact.
   * Anything else — full screen, the agent pointer overlay, no helper, a helper
   * failure — takes the native path in `handle` (on a worker thread when the native module can, 7.7.0 K4).
   */
  async handleAsync(tool: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult | undefined> {
    if ((tool === 'screenshot' || tool === 'zoom') && signal?.aborted) throw abortError(signal)
    try {
      if (tool === 'screenshot' && this.#visionEnabled && this.#helper?.supportsCapture() && args.show_agent_pointer !== true) {
        const result = await this.#sckScreenshot(args, signal)
        if (result) return result
      }
      if (tool === 'zoom' && (typeof args.target_window_id === 'number' || typeof args.target_app === 'string')) {
        return await this.#zoomWindow(args, signal)
      }
    } catch (error) {
      if (error instanceof WindowSelectionError) return errJson(error.details)
      throw error
    }
    // C7: a cancelled helper capture must not fall through to the synchronous capture below.
    if ((tool === 'screenshot' || tool === 'zoom') && signal?.aborted) throw abortError(signal)
    return this.handle(tool, args)
  }

  async #sckScreenshot(args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult | undefined> {
    const { windowId, app } = this.#captureWindow(args)
    if (windowId === undefined) return undefined
    const { width, quality } = this.#captureParams(args)
    const bounds = this.#native.getWindow?.(windowId)?.bounds
    let capture
    try {
      capture = await this.#helper!.capture({
        windowId, width, format: quality === 0 ? 'png' : 'jpeg', quality: quality === 0 ? 100 : quality,
      }, signal)
    } catch (error) {
      if (error instanceof HelperFailure && (error.code === 'aborted' || signal?.aborted)) throw abortError(signal)
      if (error instanceof HelperFailure) { this.#helperFailure = `${error.code}: ${error.message}`; return undefined }
      throw error
    }
    this.#helperFailure = undefined
    const scope = JSON.stringify(['sck', windowId, width, quality, bounds])
    if (scope === this.#lastCaptureScope && capture.hash === this.#lastHash && this.#lastResult) {
      const unchanged = this.#unchangedReply(args)
      if (unchanged) return unchanged
    }
    const data = capture.data.toString('base64')
    const frame = bounds ?? capture.frame
    const scale = frame.width / capture.width
    this.#lastMapping = { originX: frame.x, originY: frame.y, scaleX: scale, scaleY: frame.height / capture.height, imageWidth: capture.width, imageHeight: capture.height }
    this.#lastCaptureScope = scope
    this.#lastHash = capture.hash
    this.#lastScreenshot = {
      mimeType: capture.mimeType, data, capturedAt: this.#now(),
      targetArgs: { target_window_id: windowId, ...(app ? { target_app: app } : {}) },
    }
    return this.#sent({
      content: [
        { type: 'image', data, mimeType: capture.mimeType },
        { type: 'text', text: [
          `${capture.width}x${capture.height} | window ${windowId} at ${frame.x},${frame.y} sized ${frame.width}x${frame.height} (ScreenCaptureKit)`,
          `screen_x = ${frame.x} + image_x * ${scale.toFixed(4)}`,
          `screen_y = ${frame.y} + image_y * ${scale.toFixed(4)}`,
          'the capture is the window alone, without its shadow, so this mapping is exact.',
        ].join('\n') },
      ],
    })
  }

  /**
   * zoom with target_window_id / target_app: `region` is in the window's points
   * ([x1, y1, x2, y2] from its top-left), cropped from a full-resolution capture of
   * the window (ScreenCaptureKit), or from a screen capture offset by the window's
   * position when the helper is unavailable.
   */
  async #zoomWindow(args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    const region = args.region
    if (!Array.isArray(region) || region.length !== 4) throw new Error('zoom requires region: [x1, y1, x2, y2]')
    const [x1, y1, x2, y2] = region as [number, number, number, number]
    if (x1 >= x2 || y1 >= y2) throw new Error(`Invalid region: x1(${x1}) must be < x2(${x2}), y1(${y1}) must be < y2(${y2})`)
    const { windowId } = this.#captureWindow(args)
    if (windowId === undefined) {
      return errJson({ error: 'window_not_found', target_app: args.target_app ?? null, target_window_id: args.target_window_id ?? null })
    }
    const window = this.#native.getWindow?.(windowId)
    if (!window) return errJson({ error: 'window_not_found', target_window_id: windowId })
    if (typeof this.#native.cropImage !== 'function') {
      return platformUnsupported('zoom', 'platforms whose native module provides cropImage', 'Take a screenshot of the window instead.')
    }
    const outputQuality = typeof args.quality === 'number' ? args.quality : 0
    let source: { base64: string; width: number; height: number }
    let crop: [number, number, number, number]
    let via: string
    try {
      if (!this.#helper?.supportsCapture()) throw new HelperFailure('sck_unavailable', 'no ScreenCaptureKit helper')
      const capture = await this.#helper.capture({ windowId, format: 'png' }, signal)
      const s = capture.width / window.bounds.width
      source = { base64: capture.data.toString('base64'), width: capture.width, height: capture.height }
      crop = [x1 * s, y1 * s, x2 * s, y2 * s]
      via = 'window capture'
    } catch (error) {
      if (!(error instanceof HelperFailure)) throw error
      if (error.code === 'aborted' || signal?.aborted) throw abortError(signal)
      const screen = await offThread(this.#native, 'takeScreenshot', undefined, undefined, 0, undefined, undefined)
      if (!screen.base64) throw new Error('Screenshot capture failed')
      const display = this.#native.getDisplaySize()
      const s = screen.width / display.width
      source = { base64: screen.base64, width: screen.width, height: screen.height }
      crop = [(window.bounds.x + x1) * s, (window.bounds.y + y1) * s, (window.bounds.x + x2) * s, (window.bounds.y + y2) * s]
      via = 'screen capture'
    }
    const [cx1, cy1, cx2, cy2] = crop.map(Math.round) as [number, number, number, number]
    const cropped = this.#native.cropImage(source.base64, cx1, cy1, Math.min(cx2, source.width), Math.min(cy2, source.height), outputQuality)
    return { content: [
      { type: 'image', data: cropped.base64, mimeType: cropped.mimeType },
      { type: 'text', text: `${cropped.width}x${cropped.height} (window ${windowId} region ${x1},${y1}-${x2},${y2} in window points, zoomed from a ${source.width}x${source.height} ${via})` },
    ] }
  }

  lastHash(): string | undefined { return this.#lastHash }
  /** The mapping of the last image sent, for adapters that receive coordinates in image space (openai_computer). */
  lastMapping(): ScreenMapping | undefined { return this.#lastMapping ? { ...this.#lastMapping } : undefined }
  lastScreenshot(): CachedScreenshot | undefined {
    return this.#lastScreenshot ? structuredClone(this.#lastScreenshot) : undefined
  }

  /**
   * Describe a capture so a point in the image can be turned into a click.
   *
   * Reporting only `WxH`, as this used to, left every agent to infer the mapping —
   * and they infer it wrong. A screen capture scales uniformly with no offset, so
   * its mapping is exact and worth stating. A window capture includes the window's
   * shadow, so its scale is approximate and that has to be said rather than implied.
   * A window that could not be captured falls back to the screen, which is the case
   * that silently produces coordinates far from where an agent believes it clicked.
   */
  #describeCapture(
    width: number, height: number, windowId: number | undefined,
    capture?: { method: string; occluded: boolean; x: number; y: number; width: number; height: number },
  ): string {
    const size = `${width}x${height}`
    if (capture && capture.width > 0) {
      // 7.7.0 (K6, Windows): the native layer says exactly which screen rectangle the image shows and how it got it.
      const scale = capture.width / width
      this.#lastMapping = { originX: capture.x, originY: capture.y, scaleX: scale, scaleY: capture.height / height, imageWidth: width, imageHeight: height }
      const what = windowId !== undefined ? `window ${windowId}` : 'screen'
      const how = CAPTURE_METHODS[capture.method] ?? capture.method
      return [
        `${size} | ${what} at ${capture.x},${capture.y} sized ${capture.width}x${capture.height} (${how})`,
        `screen_x = ${capture.x} + image_x * ${scale.toFixed(4)}`,
        `screen_y = ${capture.y} + image_y * ${scale.toFixed(4)}`,
        capture.occluded
          ? 'the mapping is exact, but part of the window was covered when it was captured, so what covers it is in the image: bring the window forward (activate_window) for a clean capture.'
          : 'the image is exactly that rectangle, so this mapping is exact.',
      ].join('\n')
    }
    const display = this.#native.getDisplaySize()
    const imageAspect = width / height
    const screenAspect = display.width / display.height
    const looksLikeScreen = Math.abs(imageAspect - screenAspect) < 0.02

    const bounds = windowId !== undefined ? this.#native.getWindow?.(windowId)?.bounds : undefined

    if (windowId !== undefined && bounds && !looksLikeScreen) {
      // Scaled from width, because the shadow adds more height than width.
      const scale = bounds.width / width
      this.#lastMapping = { originX: bounds.x, originY: bounds.y, scaleX: scale, scaleY: scale, imageWidth: width, imageHeight: height }
      return [
        `${size} | window ${windowId} at ${bounds.x},${bounds.y} sized ${bounds.width}x${bounds.height}`,
        `screen_x ≈ ${bounds.x} + image_x * ${scale.toFixed(4)}`,
        `screen_y ≈ ${bounds.y} + image_y * ${scale.toFixed(4)}`,
        'the capture includes the window shadow, so this mapping is approximate:'
          + ' click, then capture again to confirm before typing.'
          + ' For exact coordinates omit target_window_id and use a screen capture.',
      ].join('\n')
    }

    const scale = display.width / width
    this.#lastMapping = { originX: display.x ?? 0, originY: display.y ?? 0, scaleX: scale, scaleY: display.height / height, imageWidth: width, imageHeight: height }
    const fellBack = windowId !== undefined
      ? ` | window ${windowId} could not be captured on its own, so this is the whole screen`
      : ''
    return [
      `${size} | screen ${display.width}x${display.height}${fellBack}`,
      `screen_x = image_x * ${scale.toFixed(4)}`,
      `screen_y = image_y * ${scale.toFixed(4)}`,
      'a screen capture scales uniformly with no offset, so this mapping is exact.',
    ].join('\n')
  }

  async handle(tool: string, args: Record<string, unknown>): Promise<ToolResult | undefined> {
    if (tool === 'screenshot') {
      const provider = typeof args.provider === 'string' ? args.provider : this.#defaultProvider
      const width = typeof args.width === 'number' ? args.width
        : this.#env.COMPUTER_USE_WIDTH !== undefined ? Number.parseInt(this.#env.COMPUTER_USE_WIDTH)
          : PROVIDER_WIDTH[provider] ?? 1024
      const quality = typeof args.quality === 'number' ? args.quality
        : this.#env.COMPUTER_USE_QUALITY !== undefined ? Number.parseInt(this.#env.COMPUTER_USE_QUALITY)
          : PROVIDER_QUALITY[provider] ?? PROVIDER_QUALITY.default
      // 7.6.1: full_screen wins over an explicit target and the session target (it was schema-only in 7.6.0).
      const fullScreen = args.full_screen === true
      let windowId = fullScreen ? undefined : typeof args.target_window_id === 'number' ? args.target_window_id : undefined
      const app = fullScreen || windowId ? undefined
        : typeof args.target_app === 'string' && args.target_app.length > 0 ? args.target_app : undefined
      const title = typeof args.target_title === 'string' && args.target_title.length > 0 ? args.target_title : undefined
      if (windowId === undefined && app !== undefined) {
        // v7.5 (R1): the app's main window — largest titled, ties to the frontmost —
        // or the window whose title contains target_title. Not the first layer-0
        // window, which for Unreal was a notification toast.
        try {
          windowId = resolveAppWindow(this.#native, app, title)?.windowId
        } catch (error) {
          if (error instanceof WindowSelectionError) return errJson(error.details)
          throw error
        }
      }
      if (!fullScreen && windowId === undefined && app === undefined) windowId = this.#targets.observationWindow()
      if (!this.#visionEnabled) {
        const frontmost = this.#native.getFrontmostApp()
        const display = this.#native.getDisplaySize()
        return ok(`Screen: ${display.width}×${display.height} | Frontmost: ${frontmost?.bundleId ?? 'unknown'} (${frontmost?.displayName ?? ''})`)
      }
      const showPointer = args.show_agent_pointer === true
      const scope = JSON.stringify([app, windowId, width, quality, windowId !== undefined ? this.#native.getWindow?.(windowId)?.bounds : undefined, args.display_id])
      const displayId = windowId === undefined && typeof args.display_id === 'number' ? args.display_id : undefined
      let image = await offThread(
        this.#native, 'takeScreenshot', width, windowId === undefined ? app : undefined, quality,
        showPointer || scope !== this.#lastCaptureScope ? undefined : this.#lastHash, windowId, displayId,
      )
      if (!showPointer && image.unchanged && this.#lastResult) {
        const unchanged = this.#unchangedReply(args)
        if (unchanged) return unchanged
      }
      if (!image.base64) {
        // The native layer skips encoding an unchanged frame; a re-send needs the image itself.
        image = await offThread(this.#native, 'takeScreenshot', width, windowId === undefined ? app : undefined, quality, undefined, windowId, displayId)
      }
      if (!image.base64) throw new Error('Screenshot capture missing image payload')
      if (showPointer) image = this.#pointer.annotateScreenshot(image)
      if (!image.base64) throw new Error('Screenshot capture missing image payload')
      this.#lastCaptureScope = scope
      this.#lastHash = image.hash
      this.#lastScreenshot = { mimeType: image.mimeType, data: image.base64, capturedAt: this.#now(), ...(windowId !== undefined || app ? { targetArgs: { ...(windowId !== undefined ? { target_window_id: windowId } : {}), ...(app ? { target_app: app } : {}) } } : {}) }
      return this.#sent({
        content: [
          { type: 'image', data: image.base64, mimeType: image.mimeType },
          { type: 'text', text: this.#describeCapture(image.width, image.height, windowId, image.capture) },
        ],
      })
    }
    if (tool === 'zoom') {
      const region = args.region
      if (!Array.isArray(region) || region.length !== 4) {
        throw new Error('zoom requires region: [x1, y1, x2, y2]')
      }
      const [x1, y1, x2, y2] = region as [number, number, number, number]
      if (x1 >= x2 || y1 >= y2) {
        throw new Error(`Invalid region: x1(${x1}) must be < x2(${x2}), y1(${y1}) must be < y2(${y2})`)
      }
      const source = await offThread(this.#native, 'takeScreenshot', undefined, undefined, 0, undefined, undefined)
      if (!source.base64) throw new Error('Screenshot capture failed')
      // A missing native export used to surface as `cropImage is not a function`, a
      // TypeError from JavaScript reaching for something that was never built for this
      // platform. It says nothing about which platform, why, or what to do — and it was
      // real: crop_image existed for macOS and Windows and not for Linux. Check for it,
      // and if it is absent say so in the shape every other capability gap uses.
      if (typeof this.#native.cropImage !== 'function') {
        return platformUnsupported(
          'zoom',
          'platforms whose native module provides cropImage',
          'Take a screenshot instead and crop it yourself; the reply states the mapping '
            + 'from image pixels to screen coordinates. If you built the native module '
            + 'locally, rebuild it — this export is missing rather than failing.',
        )
      }
      const cropped = this.#native.cropImage(
        source.base64, x1, y1, x2, y2, typeof args.quality === 'number' ? args.quality : 0,
      )
      return { content: [
        { type: 'image', data: cropped.base64, mimeType: cropped.mimeType },
        { type: 'text', text: `${cropped.width}x${cropped.height} (zoomed from ${source.width}x${source.height})` },
      ] }
    }
    return undefined
  }
}
