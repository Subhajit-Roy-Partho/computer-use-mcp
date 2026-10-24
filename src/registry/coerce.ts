/**
 * What models send instead of the declared type (7.7.0, A1).
 *
 * A coordinate arrives as "[100, 200]" or "100,200", a number as "500", a flag as "true", an array as ["100", "200"].
 * Each argument that fails its schema is tried once in the coerced form and kept only if that passes. An argument that
 * already passes is never touched, and nothing coerces to NaN or Infinity.
 */

import type { ZodTypeAny } from 'zod'

const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/
const NUMBER_LIST_TEXT = /^-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+$/

function numericStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(numericStrings)
  return typeof value === 'string' && NUMBER_TEXT.test(value.trim()) ? Number(value) : value
}

/** The coerced form of a value, or undefined when there is none. */
export function coercedValue(value: unknown): unknown {
  if (Array.isArray(value)) return numericStrings(value)
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text.startsWith('[')) {
    try { return numericStrings(JSON.parse(text)) } catch { return undefined }
  }
  if (NUMBER_TEXT.test(text)) return Number(text)
  if (NUMBER_LIST_TEXT.test(text)) return text.split(',').map(Number)
  if (text === 'true' || text === 'false') return text === 'true'
  return undefined
}

/** `args` with each failing argument replaced by its coerced form where that passes the argument's schema. */
export function coerceToShape(shape: Readonly<Record<string, ZodTypeAny>>, args: Record<string, unknown>): Record<string, unknown> {
  if (!args || typeof args !== 'object') return args
  let result = args
  for (const [key, value] of Object.entries(args)) {
    const schema = shape[key]
    if (!schema || value === undefined || schema.safeParse(value).success) continue
    const candidate = coercedValue(value)
    if (candidate === undefined || !schema.safeParse(candidate).success) continue
    if (result === args) result = { ...args }
    result[key] = candidate
  }
  return result
}
