import { execFile } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDemoBuild } from './demo-build.mjs'

// Start.cmd passes --build-if-stale. Without it (npm start, browser tests), the existing build is served as is.
if (process.argv.includes('--build-if-stale') && !await ensureDemoBuild(fileURLToPath(new URL('../', import.meta.url)))) {
  process.exit(1)
}

const root = fileURLToPath(new URL('../preview/', import.meta.url))
if (!existsSync(resolve(root, 'index.html'))) {
  console.error('The built demo is missing. Extract the entire ZIP, or run npm ci and npm run build:demo.')
  process.exit(1)
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function fail(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end(message)
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD')
    return fail(response, 405, 'Method not allowed')
  }

  let filename
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    if (path.includes('\0') || path.includes('\\')) return fail(response, 400, 'Invalid path')
    filename = resolve(root, `.${path.endsWith('/') ? path + 'index.html' : path}`)
  } catch {
    return fail(response, 400, 'Invalid path')
  }

  const localPath = relative(root, filename)
  if (isAbsolute(localPath) || localPath === '..' || localPath.startsWith(`..${sep}`)) {
    return fail(response, 403, 'Forbidden')
  }

  try {
    const file = await stat(filename)
    if (!file.isFile()) return fail(response, 404, 'Not found')
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filename)] ?? 'application/octet-stream',
      'Content-Length': file.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    })
    if (request.method === 'HEAD') return response.end()
    const stream = createReadStream(filename)
    stream.on('error', () => response.destroy())
    stream.pipe(response)
  } catch (error) {
    const missing = error.code === 'ENOENT' || error.code === 'ENOTDIR'
    fail(response, missing ? 404 : 500, missing ? 'Not found' : 'Unable to read file')
  }
})

const host = '127.0.0.1'
// VW_PORT lets parallel browser-test runs (for example in separate worktrees) use their own port.
// VW_PORT=0 asks the system for any free port (the chosen address is printed); an unset or empty value means 4173.
const requested = process.env.VW_PORT?.trim() || '4173'
let port = Number(requested)
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`VW_PORT must be a port number from 0 to 65535, not "${requested}".`)
  process.exit(1)
}
// --strict-port (used by the Playwright config) exits instead of moving to another port when the requested one is taken.
// A silent fallback would leave the tests talking to a server on a port they do not know.
const strictPort = process.argv.includes('--strict-port')
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && strictPort) {
    console.error(`Port ${port} on ${host} is already in use. Free it or set VW_PORT to another port.`)
    process.exitCode = 1
  } else if (error.code === 'EADDRINUSE' && port !== 0) {
    port = 0
    server.listen({ host, port })
  } else {
    console.error(error.message)
    process.exitCode = 1
  }
})

server.once('listening', () => {
  const url = `http://${host}:${server.address().port}/`
  console.log(`Vue Weave: ${url}`)
  console.log('Keep this window open. Press Ctrl+C to stop.')
  if (process.argv.includes('--open') && process.platform === 'win32') {
    execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true }, error => {
      if (error) console.log(`Open this address in your browser: ${url}`)
    })
  }
})
server.listen({ host, port })
