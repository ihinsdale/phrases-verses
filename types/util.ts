import _isPlainObject from "lodash/isPlainObject"
import every from "lodash/every"

class AssertionError extends Error {}

export const isString = (val: unknown): val is string => typeof val === "string"
export const assertString: (val: unknown) => asserts val is string = (
  val: unknown,
): asserts val is string => {
  if (!isString(val)) {
    throw new AssertionError(`Value ${val} is not a string.`)
  }
}

export const isNumber = (val: unknown): val is number => typeof val === "number"

export type PlainObject = Record<string, unknown>

export const isPlainObject = (obj: unknown): obj is PlainObject =>
  _isPlainObject(obj) && every(Object.keys(obj as {}), isString)
export const assertPlainObject: (obj: unknown) => asserts obj is PlainObject = (
  obj: unknown,
): asserts obj is PlainObject => {
  if (!isPlainObject(obj)) {
    throw new AssertionError(`Value is not a plain object.`)
  }
}

export const isArray = (obj: unknown): obj is unknown[] => Array.isArray(obj)

export function typeGuardedArray<T>(
  things: unknown,
  typeGuard: (thing: unknown) => thing is T,
): things is T[] {
  return isArray(things) && every(things, typeGuard)
}

export function genIsArrayOf<T>(
  typeGuard: (obj: unknown) => obj is T,
): (things: unknown) => things is T[] {
  return (things: unknown): things is T[] => typeGuardedArray(things, typeGuard)
}

export function assertUnreachable(x: never): never {
  throw new Error("Expected not to get here.")
}

export function assertNonNullable<T>(
  val: T | null | undefined,
): asserts val is NonNullable<T> {
  if (val === null || val === undefined) {
    throw new AssertionError(`Value ${val} is not non-nullable.`)
  }
}
export function asNonNullable<T>(val: T | null | undefined): NonNullable<T> {
  assertNonNullable(val)
  return val
}

export function assertFoundIndex(val: number): void {
  if (val === -1) {
    throw new AssertionError("Failed to find index of value.")
  }
}
