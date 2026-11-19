// Internal ID validation and error texts shared by the planning, timeline, data and graph functions. Not part of the
// public entry. An ID is a non-empty string; every other value is invalid. Failures throw an Error (never a RangeError):
//   Invalid <kind> ID: <value>
//   Duplicate <kind> ID: <id>
//   Unknown <kind> in <owner>: <value>         (references: assignments, graph edge ends and ports, group members, ...)
//   Unknown dependency endpoint: <dependency ID>
// and `withContext` appends ` (<context>)` to the message of any error thrown by a check, keeping its class.

/** Whether a value is a valid ID: a non-empty string. */
export function isId(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/** How an offending ID appears in a message: strings as they are (the empty string as `""`), other values by type. */
export function formatId(value: unknown): string {
  if (typeof value === 'string') return value === '' ? '""' : value
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object' || typeof value === 'function') return typeof value
  return String(value)
}

export function invalidIdError(kind: string, id: unknown): Error {
  return new Error(`Invalid ${kind} ID: ${formatId(id)}`)
}

export function duplicateIdError(kind: string, id: string): Error {
  return new Error(`Duplicate ${kind} ID: ${id}`)
}

/** `Unknown <kind> in <owner>: <value>`, for example `Unknown task in assignment: x`. */
export function unknownReferenceError(kind: string, owner: string, id: unknown): Error {
  return new Error(`Unknown ${kind} in ${owner}: ${formatId(id)}`)
}

/** `Unknown dependency endpoint: <dependency ID>`, for a dependency whose `from` or `to` names no task or bar. */
export function unknownEndpointError(dependencyId: unknown): Error {
  return new Error('Unknown dependency endpoint: ' + formatId(dependencyId))
}

/** Check one ID against the IDs seen so far in its collection and add it. Throws for an invalid or duplicate ID. */
export function checkId(kind: string, id: unknown, seen: Set<string>): string {
  if (!isId(id)) throw invalidIdError(kind, id)
  if (seen.has(id)) throw duplicateIdError(kind, id)
  seen.add(id)
  return id
}

/** The IDs of a collection, in input order. Throws for the first invalid or duplicate ID. */
export function uniqueIds(items: Iterable<{ readonly id: unknown } | null | undefined>, kind: string): Set<string> {
  const seen = new Set<string>()
  for (const item of items) checkId(kind, item?.id, seen)
  return seen
}

/**
 * Run `check` and add `context` to the message of an Error it throws, as ` (<context>)`, keeping the class (Error,
 * RangeError or TypeError). Other thrown values pass through unchanged.
 */
export function withContext<T>(context: string, check: () => T): T {
  try {
    return check()
  } catch (error) {
    throw error instanceof Error ? inContext(error, context) : error
  }
}

/** A new error of the same class (Error, RangeError or TypeError) whose message ends with ` (<context>)`. */
export function inContext(error: Error, context: string): Error {
  const Type = error instanceof RangeError ? RangeError : error instanceof TypeError ? TypeError : Error
  return new Type(`${error.message} (${context})`, { cause: error })
}
