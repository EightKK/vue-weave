import { execFile } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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
let port = 4173
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port !== 0) {
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
