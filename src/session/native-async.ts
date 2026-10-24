/**
 * Slow native calls off the JavaScript thread (7.7.0, K4).
 *
 * An accessibility walk of a large window, a capture, or a Windows activation that waits for the foreground can take
 * seconds. Called synchronously it held the event loop, so the status card's Stop, a host cancellation and every other
 * request waited behind it. The native module runs these on a worker when it has the `*Async` variant; an older module,
 * or a test double without one, is called synchronously as before. Either way the caller gets a promise, and a throw
 * becomes a rejection.
 */

import type { NativeModule } from '../native.js'

export type SlowCall = 'takeScreenshot' | 'getUiTree' | 'findElement' | 'getMenuBar' | 'activateWindow' | 'activateApp'

export async function offThread<K extends SlowCall>(
  native: NativeModule,
  name: K,
  ...args: Parameters<NativeModule[K]>
): Promise<ReturnType<NativeModule[K]>> {
  const variant = (native as unknown as Record<string, unknown>)[`${name}Async`]
  if (typeof variant === 'function') return await variant.apply(native, args)
  return (native[name] as (...callArgs: unknown[]) => ReturnType<NativeModule[K]>).apply(native, args)
}
