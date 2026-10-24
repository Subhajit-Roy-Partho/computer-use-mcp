import type { ToolResult } from '../result.js'
import type { SessionRequestContext } from '../session.js'
import { mapLegacyOpenAiAction } from './openai-compat.js'
import type { ScreenMapping } from './screenshot-handlers.js'

export type CompatibilityDispatch = (
  tool: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (update: { progress: number; total?: number; message?: string }) => void,
  requestContext?: SessionRequestContext,
) => Promise<ToolResult>

/** Executes the legacy OpenAI computer-action envelope through canonical tools. */
export class OpenAiCompatibilityHandler {
  readonly #dispatch: CompatibilityDispatch
  readonly #mapping: () => ScreenMapping | undefined

  /**
   * `mapping` is the last screenshot's image-to-screen mapping. 7.7.0 (K2): OpenAI's computer actions carry
   * coordinates in the pixel space of the screenshot the model saw; they were passed to input unscaled, so on any
   * capture narrower than the screen every click landed short. They are mapped through the last screenshot unless
   * the call says `coordinate_space: "screen"`.
   */
  constructor(dispatch: CompatibilityDispatch, mapping: () => ScreenMapping | undefined = () => undefined) {
    this.#dispatch = dispatch
    this.#mapping = mapping
  }

  #toScreen(args: Record<string, unknown>): Record<string, unknown> {
    const mapping = this.#mapping()
    if (!mapping) return args
    const point = (value: unknown): unknown => Array.isArray(value) && value.length >= 2
      && typeof value[0] === 'number' && typeof value[1] === 'number'
      ? [Math.round(mapping.originX + value[0] * mapping.scaleX), Math.round(mapping.originY + value[1] * mapping.scaleY)]
      : value
    const mapped = { ...args }
    if ('coordinate' in mapped) mapped.coordinate = point(mapped.coordinate)
    if ('start_coordinate' in mapped) mapped.start_coordinate = point(mapped.start_coordinate)
    if (Array.isArray(mapped.path)) mapped.path = mapped.path.map(point)
    return mapped
  }

  async handle(
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    onProgress?: (update: { progress: number; total?: number; message?: string }) => void,
    requestContext?: SessionRequestContext,
  ): Promise<ToolResult | undefined> {
    if (tool !== 'openai_computer') return undefined
    const actions = Array.isArray(args.actions)
      ? args.actions
      : args.action && typeof args.action === 'object'
        ? [args.action]
        : [{ ...args }]
    const common = {
      ...(typeof args.target_app === 'string' ? { target_app: args.target_app } : {}),
      ...(typeof args.target_window_id === 'number' ? { target_window_id: args.target_window_id } : {}),
      ...(typeof args.focus_strategy === 'string' ? { focus_strategy: args.focus_strategy } : {}),
      ...(typeof args.approval_token === 'string' ? { approval_token: args.approval_token } : {}),
    }
    const summaries: Array<Record<string, unknown>> = []
    const content: ToolResult['content'] = []
    let mappedActions
    try {
      if (actions.length > 100) throw new Error('Batch exceeds 100 actions')
      mappedActions = actions.map(action => {
        if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('invalid_action')
        return mapLegacyOpenAiAction(action as Record<string, unknown>, {
          common,
          ...(typeof args.width === 'number' ? { width: args.width } : {}),
          ...(typeof args.quality === 'number' ? { quality: args.quality } : {}),
          ...(typeof args.provider === 'string' ? { provider: args.provider } : {}),
          useVirtualPointer: args.use_virtual_pointer === true,
        })
      })
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'blocked', completed: 0, error: String(error) }) }] }
    }
    for (let index = 0; index < mappedActions.length; index++) {
      const mapped = mappedActions[index]
      let actionType = mapped.actionType
      try {
        signal?.throwIfAborted()
        actionType = mapped.actionType
        const actionArgs = args.coordinate_space === 'screen' ? mapped.args : this.#toScreen(mapped.args)
        const result = await this.#dispatch(mapped.tool, actionArgs, signal, onProgress, requestContext)
        summaries.push({ index, action: actionType, tool: mapped.tool, ok: !result.isError })
        content.push(...result.content)
        if (result.isError) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ ok: false, status: 'unknown_outcome', completed: index, failed_index: index, summaries }) },
              ...result.content,
            ],
            isError: true,
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        summaries.push({ index, action: actionType, ok: false, error: message })
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'unknown_outcome', completed: index, failed_index: index, summaries }) }],
          isError: true,
        }
      }
    }
    if (args.return_screenshot === true) {
      const result = await this.#dispatch('screenshot', {
        ...(typeof args.width === 'number' ? { width: args.width } : {}),
        ...(typeof args.quality === 'number' ? { quality: args.quality } : {}),
        ...(typeof args.provider === 'string' ? { provider: args.provider } : {}),
        ...(common.target_app === undefined ? {} : { target_app: common.target_app }),
        ...(common.target_window_id === undefined ? {} : { target_window_id: common.target_window_id }),
        show_agent_pointer: args.use_virtual_pointer === true,
      }, signal, onProgress, requestContext)
      content.push(...result.content)
      if (result.isError) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ ok: false, status: 'executed', verificationError: true, summaries }) }, ...content] }
    }
    return {
      content: [
        { type: 'text', text: JSON.stringify({ ok: true, status: 'executed', count: summaries.length, summaries }) },
        ...content,
      ],
    }
  }
}
