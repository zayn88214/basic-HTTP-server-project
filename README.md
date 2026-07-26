# Node Notes (basic-node-http-server)

A modern note management web application built **entirely** on Node.js core modules —
`http`, `fs`, `path`, and the URL utilities — with a vanilla HTML/CSS/JS frontend.
No Express, no database, no frontend framework.

![Screenshot placeholder](docs/screenshot.png)
> Replace `docs/screenshot.png` with an actual screenshot of the running app.

---

## Table of contents

1. [Features](#features)
2. [Technologies used](#technologies-used)
3. [Requirements](#requirements)
4. [Installation](#installation)
5. [Running the project](#running-the-project)
6. [npm scripts](#npm-scripts)
7. [Folder structure](#folder-structure)
8. [Browser routes](#browser-routes)
9. [API routes](#api-routes)
10. [API request and response examples](#api-request-and-response-examples)
11. [curl testing commands](#curl-testing-commands)
12. [The Node.js `http` module](#the-nodejs-http-module)
13. [The `fs` module](#the-fs-module)
14. [The Node.js event loop](#the-nodejs-event-loop)
15. [Asynchronous vs. synchronous file operations](#asynchronous-vs-synchronous-file-operations)
16. [What `package.json` does](#what-packagejson-does)
17. [HTTP status codes used](#http-status-codes-used)
18. [Error-handling strategy](#error-handling-strategy)
19. [Security considerations](#security-considerations)
20. [Manual testing checklist](#manual-testing-checklist)
21. [Suggested Git commit history](#suggested-git-commit-history)
22. [Assessment criteria checklist](#assessment-criteria-checklist)
23. [Future improvements](#future-improvements)
24. [License](#license)

---

## Features

- View a modern, dark-themed homepage
- Create notes with a validated form (title + content)
- View all saved notes in a responsive grid
- Delete notes with a confirmation prompt
- Loading, success, validation, empty, and error states throughout the UI
- A custom 404 page for unknown routes
- Notes persisted to a local JSON file (`data/notes.json`) using `fs`

## Technologies used

- **Backend:** Node.js core modules only — `http`, `fs` (`fs.promises`), `path`, `url`, `crypto`
- **Frontend:** Vanilla HTML5, CSS3 (custom properties, flexbox, grid), vanilla JavaScript (ES2020+)
- **Storage:** A local JSON file, no database

## Requirements

- Node.js **v18 or later** (uses `fs.promises`, `crypto.randomUUID`, `node --watch`)
- No `npm install` is required to run the app — there are zero production dependencies

## Installation

```bash
git clone https://github.com/your-username/basic-node-http-server.git
cd basic-node-http-server
```

There is nothing to install. The project intentionally has no production dependencies,
so you can run it immediately.

## Running the project

```bash
npm start
```

Then open **http://localhost:3000** in your browser.

For automatic restarts while editing:

```bash
npm run dev
```

## npm scripts

| Script  | Command                        | Purpose                                                       |
|---------|---------------------------------|----------------------------------------------------------------|
| `start` | `node src/server.js`             | Runs the server normally.                                      |
| `dev`   | `node --watch src/server.js`     | Runs the server and restarts it automatically on file changes.  |
| `check` | `node --check src/server.js`     | Parses `server.js` for syntax errors without executing it.      |

## Folder structure

```
basic-node-http-server/
├── data/
│   └── notes.json        # Persisted notes (2 example notes on first launch)
├── public/
│   ├── css/
│   │   └── styles.css    # Full stylesheet (dark theme, responsive, accessible)
│   ├── js/
│   │   └── app.js        # All frontend logic (fetch calls, DOM rendering, validation)
│   ├── 404.html           # Custom not-found page
│   └── index.html         # Homepage with the notes app
├── src/
│   └── server.js          # http.createServer(), routing, fs persistence
├── .gitignore
├── package.json
└── README.md
```

## Browser routes

| Route      | Description                                  |
|------------|-----------------------------------------------|
| `GET /`      | Homepage (hero and notes app)                |
| `GET /404`   | Renders the custom 404 page directly          |
| any other GET | Falls through to the custom 404 page          |

## API routes

| Method   | Route              | Description                     |
|----------|---------------------|----------------------------------|
| `GET`    | `/api/notes`         | Returns all notes                |
| `POST`   | `/api/notes`         | Creates a new note                |
| `DELETE` | `/api/notes/:id`      | Deletes the note with the given id |

## API request and response examples

### `GET /api/notes`

Response `200 OK`:

```json
{
  "success": true,
  "count": 2,
  "notes": [
    {
      "id": "b3f1c2a4-1111-4a2b-9c3d-000000000001",
      "title": "Welcome to Notes",
      "content": "This is your first note...",
      "createdAt": "2026-01-05T09:00:00.000Z"
    }
  ]
}
```

### `POST /api/notes`

Request body:

```json
{
  "title": "Example title",
  "content": "Example content"
}
```

Response `201 Created`:

```json
{
  "success": true,
  "message": "Note created successfully",
  "note": {
    "id": "generated-uuid",
    "title": "Example title",
    "content": "Example content",
    "createdAt": "2026-07-26T20:00:00.000Z"
  }
}
```

Validation failure response `400 Bad Request`:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": ["Title cannot be empty", "Content cannot be empty"]
}
```

### `DELETE /api/notes/:id`

Response `200 OK`:

```json
{
  "success": true,
  "message": "Note deleted successfully"
}
```

Response when the note does not exist, `404 Not Found`:

```json
{
  "success": false,
  "error": "Note not found"
}
```

## curl testing commands

```bash
# Get all notes
curl -s http://localhost:3000/api/notes

# Create a valid note
curl -s -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"My note","content":"Some content"}'

# Send invalid JSON
curl -s -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{invalid json'

# Send empty fields
curl -s -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"","content":""}'

# Send a title longer than 80 characters
curl -s -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"$(printf 'x%.0s' {1..90})\",\"content\":\"ok\"}"

# Delete an existing note (replace :id with a real id from GET /api/notes)
curl -s -X DELETE http://localhost:3000/api/notes/:id

# Delete a missing note
curl -s -X DELETE http://localhost:3000/api/notes/does-not-exist

# Request an unknown API route
curl -s http://localhost:3000/api/unknown

# Request an unknown browser route
curl -s http://localhost:3000/some-unknown-page

# Use an unsupported method
curl -s -X PUT http://localhost:3000/api/notes
```

Syntax check and start commands used during development:

```bash
npm run check
npm start
```

## The Node.js `http` module

`http.createServer()` is the foundation of this app. It hands us a raw `req`
(request) and `res` (response) object for every incoming connection. There's no
router, middleware chain, or templating engine underneath it — every routing
decision (matching a method and pathname to a handler) is written explicitly in
`src/server.js`. This is the same layer that frameworks like Express are built
on top of; using it directly shows how request parsing, header/status-code
setting, and streaming a response actually work under the hood.

## The `fs` module

`fs.promises` (the promise-based variant of `fs`) is used for every file
operation in this project:

- `fs.promises.readFile` reads `data/notes.json` when listing, creating, or
  deleting notes, and reads static assets (HTML/CSS/JS) to serve them.
- `fs.promises.writeFile` persists the notes array back to disk after a
  create or delete.
- `fs.promises.mkdir` and `fs.promises.access` are used once at startup to
  make sure the `data/` directory and `notes.json` file exist, initializing
  an empty array if they don't.

## The Node.js event loop

Node.js runs your JavaScript on a **single main thread**. When the server calls
an asynchronous operation such as `fs.readFile`, that operation is handed off
to run in the background (via the operating system/libuv's thread pool)
instead of blocking that main thread. While it's in progress, the event loop
is free to keep handling other requests — accepting new connections, serving
static files, responding to other API calls, and so on.

Once the file operation completes, its callback (or, with promises, the
`.then()` continuation) is placed into a callback queue. The event loop only
runs that callback once the current call stack is empty — meaning any
synchronous code already running finishes first. This is exactly how this
server can handle many simultaneous requests with just one thread: a slow
disk read triggered by one client's request never blocks the responses being
sent to other clients.

It's also why **CPU-heavy or synchronous work can still block the event
loop** — if you ran a long synchronous loop or used `fs.readFileSync` on a
large file, the entire server would be unresponsive until that operation
finished, no matter how many other requests were waiting.

## Asynchronous vs. synchronous file operations

Node also exposes synchronous file APIs (`fs.readFileSync`,
`fs.writeFileSync`). These block the entire main thread until the disk
operation finishes — nothing else runs on the server in the meantime. In a
single-threaded runtime, that means one slow disk read could stall every
other user's request. This project uses the asynchronous `fs.promises` API
everywhere specifically so file I/O for one request never blocks anyone else.

### Avoiding write races

Because multiple requests could try to modify `notes.json` at nearly the same
time, all read-modify-write operations (creating or deleting a note) are
chained through a simple in-process **write queue** — a promise chain defined
in `src/server.js`. Each operation attaches itself to the end of the current
chain, so writes always execute one after another instead of overlapping and
overwriting each other's changes. This is a lightweight, beginner-friendly fix
that works well for a single Node.js process; it would not by itself protect
against multiple separate server processes writing to the same file.

## What `package.json` does

`package.json` is this project's manifest. It records the package name,
version, description, entry point (`main`), author, license, the minimum
supported Node.js version (`engines`), and the `scripts` used to run, watch,
and syntax-check the server. Because this project has no dependencies, there
is no `dependencies` field — `npm start` works immediately after cloning.

## HTTP status codes used

| Code | Meaning                | Used when...                                                   |
|------|-------------------------|------------------------------------------------------------------|
| 200  | OK                       | A GET or DELETE request succeeds                                 |
| 201  | Created                  | A new note is created successfully                                |
| 400  | Bad Request              | Invalid JSON, a malformed URL, or failed validation               |
| 404  | Not Found                | An unknown route, or a note id that doesn't exist                 |
| 405  | Method Not Allowed       | A known route is hit with an unsupported HTTP method              |
| 413  | Payload Too Large        | A request body exceeds the 1 MB limit                              |
| 415  | Unsupported Media Type   | A POST request is sent without a JSON `Content-Type`               |
| 500  | Internal Server Error    | An unexpected server-side failure                                 |

## Error-handling strategy

- All routing logic runs inside a `Promise.resolve().then(...).catch(...)`
  wrapper so any thrown error (sync or async) is caught and turned into a
  clean `500` JSON response instead of crashing the process.
- `notes.json` reads are defensive: a missing file, an empty file, and
  invalid JSON are all handled by falling back to an empty array rather than
  throwing.
- Request bodies are streamed in manually with a running byte count, so an
  oversized payload is rejected (`413`) before it's fully buffered in memory.
- Malformed low-level HTTP requests are handled via the server's `clientError`
  event, which responds with a plain `400` instead of letting Node crash.
- No internal error messages, stack traces, or file paths are ever sent to
  the client — only generic, safe error messages.

## Security considerations

- **Directory traversal protection:** every static asset path is normalized
  and resolved, then checked to confirm it still lives inside the `public/`
  directory before being served.
- **Body size limit:** request bodies are capped at 1 MB, enforced while
  streaming (not just after buffering).
- **JSON parsing safety:** invalid JSON is caught and rejected with a `400`
  instead of throwing an unhandled exception.
- **Input validation:** title and content are required, must be strings,
  are trimmed, must be non-empty, and are capped at 80 and 1000 characters
  respectively.
- **Safe rendering:** the frontend only ever uses `textContent` to render
  note titles/content — never `innerHTML` — preventing stored XSS from note
  data.
- **Security headers** are set on every response: `X-Content-Type-Options:
  nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a
  restrictive `Content-Security-Policy`.
- **No secrets or hard-coded absolute paths** — everything path-related is
  built from `__dirname` and `path.join`.

## Manual testing checklist

- [ ] `npm run check` passes with no syntax errors
- [ ] `npm start` boots the server on `http://localhost:3000`
- [ ] Homepage loads with hero, notes form, notes grid, and technical section
- [ ] Creating a note with valid input shows a loading state, then success
- [ ] Creating a note with empty fields shows inline validation errors
- [ ] Creating a note with an overly long title/content is rejected
- [ ] Deleting a note asks for confirmation, then removes it from the grid
- [ ] Emptying all notes shows the empty state message
- [ ] Visiting an unknown route shows the custom 404 page
- [ ] Resizing to mobile width shows the collapsible navigation menu
- [ ] Keyboard-only navigation can reach and activate every interactive element
- [ ] Focus outlines are visible when tabbing through the page

## Suggested Git commit history

```
chore: initialize project structure and package.json
feat: add http server with static file serving
feat: add directory traversal protection and MIME type handling
feat: add notes persistence layer using fs.promises
feat: implement GET/POST/DELETE /api/notes routes
feat: add input validation and error handling for notes API
feat: add write queue to prevent concurrent write races
style: build dark theme design system in styles.css
feat: build homepage markup and notes UI
feat: build custom 404 page
feat: implement frontend app.js (fetch, render, validation, states)
feat: add accessibility features (aria-live, focus states, labels)
feat: add security headers and request body size limits
docs: write README with setup, API docs, and testing guide
test: manual testing pass across routes and edge cases
```

## Assessment criteria checklist

- [x] **Basic HTTP server using the Node.js built-in `http` module** — see `src/server.js`, built with `http.createServer()`.
- [x] **Clear explanation of the Node.js event loop** — see [The Node.js event loop](#the-nodejs-event-loop) above.
- [x] **Use of the Node.js built-in `fs` module for file reading and writing** — see [The `fs` module](#the-fs-module) and the `readNotes`/`writeNotes` functions in `src/server.js`.
- [x] **Understanding of npm and `package.json` scripts** — see [npm scripts](#npm-scripts) and `package.json`.
- [x] **Modern, responsive, accessible, visually impressive UI** — see `public/css/styles.css` and the semantic, ARIA-labeled markup in `public/*.html`.

## Future improvements

- Add automated tests (e.g. using Node's built-in `node:test` module)
- Add note editing (`PUT`/`PATCH /api/notes/:id`)
- Add search/filter and tagging for notes
- Add pagination for large note collections
- Add a light theme toggle

## License

This project is licensed under the MIT License. See below:

```
MIT License

Copyright (c) 2026 Your Name

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
#   b a s i c - H T T P - s e r v e r - p r o j e c t  
 