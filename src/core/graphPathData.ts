// Internal reader of SVG path data, shared by graphPathBounds, graphPathEndpoints, graphPathPolylines and the routing
// of kept bypass lanes. Not exported from the package entry points.

/** The number of arguments of each SVG path command, by upper-case command letter. */
export const svgPathArgumentCounts: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** One segment of path data in absolute coordinates. */
export interface PathSegment {
  /** Upper-case command letter. The argument pairs that follow the first pair of a moveto are reported as `L`. */
  command: string
  /** Current point before the segment. */
  x0: number
  y0: number
  /**
   * The arguments, with the coordinates of relative commands shifted to absolute ones: one x for H, one y for V, the
   * radii, rotation and flags as read plus the absolute end point for A, and absolute points for the other commands.
   * Empty for Z.
   */
  args: number[]
  /** Current point after the segment; for Z the start of the subpath. */
  x: number
  y: number
}

/**
 * How path data is read. `strict` throws for malformed data, an unsupported command or data that does not begin with a
 * moveto; it reads each arc flag as a single 0 or 1 that needs no separator (as in `A 5 5 0 1010 10`) and rejects an
 * exponent marker without digits. `lenient` reads command letters and numbers and skips any other character; numbers
 * that do not fill a whole argument group are dropped, a run of numbers is read only once the next command letter (or
 * the end) is reached, and a number that is not finite ends the data before its run. Arc flags are ordinary numbers,
 * so compact flags such as `1010` are read as one number.
 */
export type PathReadMode = 'strict' | 'lenient'

const strictNumber = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
const lenientToken = /([MLHVCSQTAZmlhvcsqtaz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g

/** SVG path whitespace (space, tab, line feed, form feed, carriage return) or a comma. */
function isPathSeparator(char: string): boolean {
  return char === ' ' || char === ',' || char === '\t' || char === '\n' || char === '\r' || char === '\f'
}

function isAsciiLetter(char: string): boolean {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
}

/** Calls `visit` with each segment of `path`, in order. See `PathReadMode` for what each mode accepts. */
export function readPathSegments(path: string, mode: PathReadMode, visit: (segment: PathSegment) => void): void {
  let x = 0, y = 0, startX = 0, startY = 0
  // One argument group of a command: `raw` holds the numbers as read.
  const apply = (command: string, relative: boolean, raw: readonly number[], continued: boolean) => {
    const x0 = x, y0 = y
    const ox = relative ? x : 0, oy = relative ? y : 0
    let args: number[]
    if (command === 'H') x = (args = [raw[0]! + ox])[0]!
    else if (command === 'V') y = (args = [raw[0]! + oy])[0]!
    else {
      args = command === 'A'
        ? [raw[0]!, raw[1]!, raw[2]!, raw[3]!, raw[4]!, raw[5]! + ox, raw[6]! + oy]
        : raw.map((value, i) => value + (i % 2 === 0 ? ox : oy))
      x = args[args.length - 2]!
      y = args[args.length - 1]!
    }
    if (command === 'M' && !continued) {
      startX = x
      startY = y
    }
    visit({ command: command === 'M' && continued ? 'L' : command, x0, y0, args, x, y })
  }
  const close = () => {
    const x0 = x, y0 = y
    x = startX
    y = startY
    visit({ command: 'Z', x0, y0, args: [], x, y })
  }
  if (mode === 'strict') readStrict(path, apply, close)
  else readLenient(path, apply, close)
}

type ApplyGroup = (command: string, relative: boolean, raw: readonly number[], continued: boolean) => void

function readStrict(path: string, apply: ApplyGroup, close: () => void) {
  const invalid = () => new Error('Invalid SVG path data: ' + path)
  let cursor = 0
  const skipSeparators = () => {
    while (cursor < path.length && isPathSeparator(path[cursor]!)) cursor++
  }
  const readNumber = () => {
    skipSeparators()
    strictNumber.lastIndex = cursor
    const match = strictNumber.exec(path)
    if (!match) throw invalid()
    cursor = strictNumber.lastIndex
    // An exponent marker without digits, as in `1e`, is malformed rather than an `e` command.
    if (path[cursor] === 'e' || path[cursor] === 'E') throw invalid()
    const value = Number(match[0])
    if (!Number.isFinite(value)) throw invalid()
    return value
  }
  // Arc flags are a single 0 or 1 and need no separator before the next number, as in `A 5 5 0 1010 10`.
  const readFlag = () => {
    skipSeparators()
    const char = path[cursor]
    if (char !== '0' && char !== '1') throw invalid()
    cursor++
    return char === '1' ? 1 : 0
  }

  let started = false
  while (true) {
    skipSeparators()
    if (cursor >= path.length) break
    const token = path[cursor]!
    if (!isAsciiLetter(token)) throw invalid()
    cursor++
    const command = token.toUpperCase()
    const relative = token !== command
    const count = svgPathArgumentCounts[command]
    if (count === undefined) throw new Error('Unsupported SVG path command: ' + token)
    // Path data must begin with a moveto.
    if (!started && command !== 'M') throw invalid()
    started = true
    if (count === 0) {
      close()
      continue
    }
    let first = true
    // A command can be followed by repeated argument groups; a repeated M continues as L.
    while (true) {
      skipSeparators()
      if (cursor >= path.length || isAsciiLetter(path[cursor]!)) {
        if (first) throw invalid()
        break
      }
      const raw: number[] = []
      for (let i = 0; i < count; i++) raw.push(command === 'A' && (i === 3 || i === 4) ? readFlag() : readNumber())
      apply(command, relative, raw, !first)
      first = false
    }
  }
}

function readLenient(path: string, apply: ApplyGroup, close: () => void) {
  let token = ''
  const values: number[] = []
  // Reads the complete argument groups of the current command; a repeated M continues as L.
  const flush = () => {
    const command = token.toUpperCase()
    const count = svgPathArgumentCounts[command]
    if (!count) return
    const relative = token !== command
    for (let offset = 0; values.length - offset >= count; offset += count) {
      apply(command, relative, values.slice(offset, offset + count), offset > 0)
    }
  }
  for (const match of path.matchAll(lenientToken)) {
    if (match[1]) {
      flush()
      values.length = 0
      token = match[1]
      if (token === 'Z' || token === 'z') close()
      continue
    }
    const value = Number(match[2])
    if (!Number.isFinite(value)) return
    values.push(value)
  }
  flush()
}
