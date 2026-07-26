# Node Notes

A simple note management application built using only Node.js core modules. It demonstrates building a REST API with the `http` module and storing data in a JSON file using `fs`, without Express, databases, or third-party libraries.

---

## Features

* Create, view, and delete notes
* Persistent JSON file storage
* Server-side and client-side validation
* Custom 404 page
* No production dependencies

---

## Tech Stack

* **Backend:** Node.js (`http`, `fs`, `path`, `url`, `crypto`)
* **Frontend:** HTML, CSS, JavaScript
* **Storage:** JSON (`data/notes.json`)

---

## Requirements

* Node.js 18+

---

## Installation

```bash
git clone https://github.com/your-username/basic-node-http-server.git
cd basic-node-http-server
```

No `npm install` is required.

---

## Running

Start the server:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

Syntax check:

```bash
npm run check
```

Visit:

```text
http://localhost:3000
```

---

## Project Structure

```text
basic-node-http-server/
├── data/
├── public/
├── src/
├── package.json
└── README.md
```

---

## API Endpoints

| Method | Endpoint         | Description        |
| ------ | ---------------- | ------------------ |
| GET    | `/api/notes`     | Retrieve all notes |
| POST   | `/api/notes`     | Create a note      |
| DELETE | `/api/notes/:id` | Delete a note      |

### POST Validation

* `title` and `content` are required
* `title` ≤ 80 characters
* `content` ≤ 1000 characters
* Request body limited to 1 MB

---

## Status Codes

| Code | Meaning                |
| ---- | ---------------------- |
| 200  | OK                     |
| 201  | Created                |
| 400  | Bad Request            |
| 404  | Not Found              |
| 405  | Method Not Allowed     |
| 413  | Payload Too Large      |
| 415  | Unsupported Media Type |
| 500  | Internal Server Error  |

---

## License

MIT
