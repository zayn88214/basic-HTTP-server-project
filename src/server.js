'use strict';

/**
 * basic-node-http-server
 * -----------------------------------------------------------------------
 * A note-taking web application built ONLY with Node.js core modules:
 *   - http   -> creates the server and handles requests/responses
 *   - fs     -> reads/writes static assets and the notes.json data file
 *   - path   -> resolves and validates file paths safely
 *   - url    -> parses incoming request URLs
 *
 * No frameworks (Express, Fastify, etc.) and no databases are used.
 * -----------------------------------------------------------------------
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

const MAX_BODY_SIZE = 1 * 1024 * 1024; // 1 MB
const MAX_TITLE_LENGTH = 80;
const MAX_CONTENT_LENGTH = 1000;

// MIME types for the small set of static assets we serve.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ---------------------------------------------------------------------------
// Simple in-process write queue
// ---------------------------------------------------------------------------
// fs.writeFile calls that overlap in time can race with each other: if two
// requests both read the notes array, modify it, and write it back at
// roughly the same time, the second write can silently overwrite the first
// one's changes. Because this server runs everything on a single Node.js
// process/thread, we can avoid that by keeping a "chain" promise. Every
// write (or read-modify-write) operation attaches itself to the END of the
// current chain, so operations that touch notes.json always run one after
// another, in the order they arrived, instead of overlapping.
// This is NOT a general-purpose file lock (it would not help across
// multiple processes/servers), but it is a simple, beginner-friendly fix
// for the single-process race condition described above.
let writeQueue = Promise.resolve();

function enqueue(task) {
  const result = writeQueue.then(() => task());
  // Swallow errors here so a failed task doesn't permanently break the
  // queue for future operations; the caller still receives the rejection.
  writeQueue = result.catch(() => {});
  return result;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function logRequest(method, urlPath, statusCode, startTime) {
  const durationMs = Date.now() - startTime;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${method} ${urlPath} -> ${statusCode} (${durationMs}ms)`);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none';"
  );
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

async function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const data = await fsp.readFile(filePath);
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': data.length,
  });
  res.end(data);
}

async function send404Page(res) {
  try {
    await sendFile(res, path.join(PUBLIC_DIR, '404.html'), 404);
  } catch (err) {
    sendText(res, 404, 'Not Found');
  }
}

async function send500Page(res) {
  sendJson(res, 500, {
    success: false,
    error: 'Internal server error',
  });
}

// ---------------------------------------------------------------------------
// Static file serving with directory traversal protection
// ---------------------------------------------------------------------------

/**
 * Resolves a requested static asset path against PUBLIC_DIR and makes sure
 * the resolved, normalized path still lives inside PUBLIC_DIR. This blocks
 * traversal attempts such as "/../../etc/passwd" or encoded variants.
 */
function resolveSafeStaticPath(requestedPath) {
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const candidate = path.join(PUBLIC_DIR, normalized);
  const resolved = path.resolve(candidate);
  const resolvedRoot = path.resolve(PUBLIC_DIR);

  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Notes data access (fs-based persistence)
// ---------------------------------------------------------------------------

/**
 * Ensures the data directory and notes.json file exist. If notes.json is
 * missing, it is initialised with an empty array so the rest of the app can
 * assume the file always exists.
 */
async function ensureNotesFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(NOTES_FILE, fs.constants.F_OK);
  } catch (err) {
    await fsp.writeFile(NOTES_FILE, '[]', 'utf8');
  }
}

/**
 * Reads and parses notes.json. Handles a missing file, an empty file, and
 * invalid JSON by falling back to an empty array rather than crashing the
 * server.
 */
async function readNotes() {
  await ensureNotesFile();

  let raw;
  try {
    raw = await fsp.readFile(NOTES_FILE, 'utf8');
  } catch (err) {
    console.error('Failed to read notes.json:', err.message);
    return [];
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('notes.json contained invalid JSON, resetting to empty array:', err.message);
    return [];
  }
}

/**
 * Writes the notes array back to notes.json. Wrapped in the write queue by
 * callers so overlapping requests cannot corrupt the file.
 */
async function writeNotes(notes) {
  const data = JSON.stringify(notes, null, 2);
  await fsp.writeFile(NOTES_FILE, data, 'utf8');
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

/**
 * Reads the request body while enforcing a maximum size limit, and returns
 * it as a UTF-8 string. Rejects with a tagged error if the body is too
 * large or the connection errors out.
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let totalLength = 0;
    const chunks = [];
    let rejected = false;

    req.on('data', (chunk) => {
      if (rejected) return;
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        rejected = true;
        const err = new Error('Request body too large');
        err.code = 'PAYLOAD_TOO_LARGE';
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (rejected) return;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', (err) => {
      if (rejected) return;
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateNoteInput(body) {
  const errors = [];

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  const { title, content } = body;

  if (typeof title !== 'string') {
    errors.push('Title is required and must be a string');
  }
  if (typeof content !== 'string') {
    errors.push('Content is required and must be a string');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  if (trimmedTitle.length === 0) {
    errors.push('Title cannot be empty');
  }
  if (trimmedContent.length === 0) {
    errors.push('Content cannot be empty');
  }
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    errors.push(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  }
  if (trimmedContent.length > MAX_CONTENT_LENGTH) {
    errors.push(`Content must be at most ${MAX_CONTENT_LENGTH} characters`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, title: trimmedTitle, content: trimmedContent };
}

function generateId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------------------
// Route handlers: API
// ---------------------------------------------------------------------------

async function handleGetNotes(req, res) {
  const notes = await readNotes();
  sendJson(res, 200, {
    success: true,
    count: notes.length,
    notes,
  });
}

async function handleCreateNote(req, res) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return sendJson(res, 415, {
      success: false,
      error: 'Content-Type must include application/json',
    });
  }

  let rawBody;
  try {
    rawBody = await readRequestBody(req);
  } catch (err) {
    if (err.code === 'PAYLOAD_TOO_LARGE') {
      return sendJson(res, 413, { success: false, error: 'Request body too large (max 1MB)' });
    }
    return sendJson(res, 400, { success: false, error: 'Failed to read request body' });
  }

  let parsedBody;
  try {
    parsedBody = rawBody.trim().length === 0 ? {} : JSON.parse(rawBody);
  } catch (err) {
    return sendJson(res, 400, { success: false, error: 'Invalid JSON in request body' });
  }

  const validation = validateNoteInput(parsedBody);
  if (!validation.valid) {
    return sendJson(res, 400, {
      success: false,
      error: 'Validation failed',
      details: validation.errors,
    });
  }

  const newNote = {
    id: generateId(),
    title: validation.title,
    content: validation.content,
    createdAt: new Date().toISOString(),
  };

  try {
    await enqueue(async () => {
      const notes = await readNotes();
      notes.push(newNote);
      await writeNotes(notes);
    });
  } catch (err) {
    console.error('Failed to persist new note:', err.message);
    return sendJson(res, 500, { success: false, error: 'Failed to save note' });
  }

  sendJson(res, 201, {
    success: true,
    message: 'Note created successfully',
    note: newNote,
  });
}

async function handleDeleteNote(req, res, id) {
  let noteExisted = false;

  try {
    await enqueue(async () => {
      const notes = await readNotes();
      const index = notes.findIndex((note) => note.id === id);
      if (index === -1) {
        noteExisted = false;
        return;
      }
      noteExisted = true;
      notes.splice(index, 1);
      await writeNotes(notes);
    });
  } catch (err) {
    console.error('Failed to delete note:', err.message);
    return sendJson(res, 500, { success: false, error: 'Failed to delete note' });
  }

  if (!noteExisted) {
    return sendJson(res, 404, { success: false, error: 'Note not found' });
  }

  sendJson(res, 200, {
    success: true,
    message: 'Note deleted successfully',
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleApiRoute(req, res, pathname) {
  // GET /api/notes
  if (pathname === '/api/notes' && req.method === 'GET') {
    return handleGetNotes(req, res);
  }

  // POST /api/notes
  if (pathname === '/api/notes' && req.method === 'POST') {
    return handleCreateNote(req, res);
  }

  if (pathname === '/api/notes') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  // DELETE /api/notes/:id
  const noteIdMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (noteIdMatch) {
    const id = decodeURIComponent(noteIdMatch[1]);
    if (req.method === 'DELETE') {
      return handleDeleteNote(req, res, id);
    }
    res.setHeader('Allow', 'DELETE');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  // Unknown API route
  return sendJson(res, 404, { success: false, error: 'API route not found' });
}

async function handleBrowserRoute(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return sendJson(res, 405, { success: false, error: 'Method not allowed' });
  }

  if (pathname === '/') {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
  }

  if (pathname === '/404') {
    return sendFile(res, path.join(PUBLIC_DIR, '404.html'), 404);
  }

  return send404Page(res);
}

async function handleStaticAsset(req, res, pathname) {
  const safePath = resolveSafeStaticPath(pathname);

  if (!safePath) {
    return sendJson(res, 400, { success: false, error: 'Invalid path' });
  }

  try {
    const stats = await fsp.stat(safePath);
    if (stats.isDirectory()) {
      return send404Page(res);
    }
    return sendFile(res, safePath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return send404Page(res);
    }
    throw err;
  }
}

async function router(req, res, pathname) {
  if (pathname.startsWith('/api/')) {
    return handleApiRoute(req, res, pathname);
  }

  if (pathname.startsWith('/css/') || pathname.startsWith('/js/')) {
    return handleStaticAsset(req, res, pathname);
  }

  return handleBrowserRoute(req, res, pathname);
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  let statusLogged = false;

  res.on('finish', () => {
    if (!statusLogged) {
      statusLogged = true;
      logRequest(req.method, req.url, res.statusCode, startTime);
    }
  });

  setSecurityHeaders(res);

  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch (err) {
    // Malformed request URL: respond safely instead of crashing.
    sendJson(res, 400, { success: false, error: 'Malformed request URL' });
    return;
  }

  const pathname = decodeURIComponentSafe(parsedUrl.pathname);

  Promise.resolve()
    .then(() => router(req, res, pathname))
    .catch((err) => {
      console.error('Unhandled error while processing request:', err);
      if (!res.headersSent) {
        send500Page(res);
      } else {
        res.end();
      }
    });
});

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

server.on('clientError', (err, socket) => {
  // Handles malformed low-level HTTP requests without crashing the process.
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n');
  }
});

ensureNotesFile()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`basic-node-http-server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialise data file:', err);
    process.exit(1);
  });

module.exports = server;
