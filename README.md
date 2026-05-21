# Cloud File Explorer — Backend

**🌐 Live Hosted Website on Vercel: [https://cloudfileexplorerfrontend.vercel.app](https://cloudfileexplorerfrontend.vercel.app/)**

**🖥️ Frontend Repository: [https://github.com/darshankardil-create/CloudFileExplorer_FrontEnd](https://github.com/darshankardil-create/CloudFileExplorer_FrontEnd)**

---

A Node.js/Express REST API + Socket.IO backend for a cloud-based file explorer. Users can organize files and folders in an infinitely nested hierarchy, with files hosted on Cloudinary and metadata persisted in MongoDB. An AI assistant (powered by a Hugging Face LLM) interprets natural-language commands and maps them to API actions.

**📁 Supports infinite nested folder creation — users can create folders within folders to any depth, with full support for upload, delete, rename, drag-and-drop, and size calculation across the entire tree.**

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
  - [authAndTopLevelFoldersIds](#1-authandtoplevelfolderidsmodel)
  - [NestedFoldersData](#2-nestedfordersdatamodel)
  - [SchemaOfFilesAndNestedFoldersIds](#3-schemaoffilesandnestedfolderids-sub-schema)
- [How the Folder Tree Works](#how-the-folder-tree-works)
- [API Endpoints](#api-endpoints)
  - [Auth](#auth)
  - [Folders & Files](#folders--files)
  - [Drag & Drop](#drag--drop)
  - [AI Data Feed](#ai-data-feed)
- [Controller Logic](#controller-logic)
- [Socket.IO — AI Chat](#socketio--ai-chat)
- [AI Prompt Design](#ai-prompt-design)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express.js |
| Database | MongoDB via Mongoose |
| File Storage | Cloudinary |
| Real-time | Socket.IO |
| Auth | JWT (jsonwebtoken) + bcrypt |
| AI | Hugging Face Inference API (`Qwen3.6-27B`) |

---

## Project Structure

```
├── app.js                        # Entry point — Express, HTTP server, Socket.IO init
└── src/
    ├── config/
    │   ├── cloudinary_config.js  # Cloudinary SDK setup
    │   └── connect_db.js         # Mongoose connection
    ├── schema/
    │   ├── authAndTopLevelFoldersIdsModel.js     # User doc + top-level refs
    │   ├── NestedFoldersDataModel.js             # All folder documents
    │   └── SchemaOfFilesAndNestedFoldersIds.js   # Reusable sub-schema
    ├── controller.js             # All route handler functions
    ├── prompt.js                 # System prompt for the AI assistant
    ├── routes.js                 # Express router
    └── socketconnection.js       # Socket.IO server + AI inference
```

---

## Architecture Overview

```
Client
  │
  ├── REST (HTTP)  ──►  Express Router  ──►  Controllers
  │                                              │
  │                                    ┌─────────┼─────────┐
  │                                 MongoDB   Cloudinary   JWT
  │
  └── WebSocket  ──►  Socket.IO  ──►  HuggingFace LLM
                                       (returns JSON action)
                                             │
                                        Client executes
                                        the REST call
```

The AI layer does **not** call the API itself — it returns a structured JSON object that the frontend interprets and uses to fire the correct REST endpoint.

---

## Database Schema

### 1. `authAndTopLevelFoldersIdsModel`

**Collection:** `auth_and_toplevel_folders_ids`

This is the root document for every user. It stores credentials and holds references to everything the user owns at the top level of their file explorer.

```js
{
  username: String,           // unique, required
  password: String,           // bcrypt-hashed via pre-save hook
  toplevel_folders_and_toplevel_files_ids: [SchemaOfFilesAndNestedFoldersIds],
  createdAt: Date,
  updatedAt: Date
}
```

**Why this design?** The user document intentionally stores only _references_ (IDs) to top-level folders — not the folder data itself. This keeps the root document lightweight and allows folders to grow infinitely without bloating the user record.

**Methods:**
- `schema.pre("save")` — Automatically hashes `password` with bcrypt (salt rounds: 10) before saving, but only when the password field is modified.
- `schema.methods.comparehash(plaintext)` — Returns a boolean; used during login to verify passwords.

---

### 2. `NestedFoldersDataModel`

**Collection:** `nested_folders_datas`

A single flat collection that stores **all** folder documents — both top-level and deeply nested. Every folder, regardless of depth, lives here as its own document.

```js
{
  foldername: String,
  parentid: String,           // _id of the parent folder doc (for reference cleanup on delete)
  files_and_nested_folders_ids: [SchemaOfFilesAndNestedFoldersIds]
}
```

**Why a flat collection instead of embedding?** Embedding nested folders would cause unbounded document growth and make deep queries impossible. A flat collection with `parentid` allows MongoDB's `$graphLookup` to traverse the entire tree in a single aggregation pipeline, no matter how deep.

---

### 3. `SchemaOfFilesAndNestedFoldersIds` (Sub-schema)

This is a reusable Mongoose sub-schema embedded inside both models above. Each element in the array represents **either** a child folder reference **or** a file.

```js
{
  type: String,               // "folder" or "file"

  folderids: {
    folderid: ObjectId        // ref to a document in nested_folders_datas
  },

  file_ids: {
    publicid: String,         // Cloudinary public ID (used for deletion)
    url: String,              // Cloudinary CDN URL
    time: String,             // Upload timestamp
    name: String,             // Original filename
    bytes: Number             // File size in bytes
  }
}
```

**Design note:** Each item in the array is mutually exclusive — either `folderids.folderid` is populated (it's a folder reference) or `file_ids.publicid` is populated (it's a file). The `type` field makes this explicit. File metadata is stored directly (no separate files collection) because files are immutable records pointing to Cloudinary.

---

## How the Folder Tree Works

The tree is resolved using MongoDB's `$graphLookup` aggregation stage, which performs a recursive graph traversal entirely on the database side.

**Example: fetching all nested content under a user's root**

```js
authAndTopLevelFoldersIdsModel.aggregate([
  { $match: { _id: userObjectId } },
  {
    $graphLookup: {
      from: "nested_folders_datas",
      startWith: "$toplevel_folders_and_toplevel_files_ids.folderids.folderid",
      connectFromField: "files_and_nested_folders_ids.folderids.folderid",
      connectToField: "_id",
      as: "allNestedFolders"
    }
  }
])
```

This returns a flat array `allNestedFolders` containing every folder document reachable from the user's root — at any depth — in one query. The same pattern is used for delete operations (to find all sub-folders and their files before deletion) and for the AI data feed.

---

## API Endpoints

Base path: `/api`

### Auth

| Method | Route | Handler | Description |
|---|---|---|---|
| `POST` | `/signIn` | `signIn` | Register a new user. Returns a JWT. |
| `POST` | `/logIn` | `logIn` | Login with username + password. Returns a JWT. |
| `GET` | `/me` | `me` | Verify a Bearer JWT. Returns user id + username. |

**JWT:** Signed with `process.env.JWTSECRET`, expires in 30 days. The `me` endpoint reads the `Authorization: Bearer <token>` header.

---

### Folders & Files

| Method | Route | Handler | Description |
|---|---|---|---|
| `POST` | `/createtoplevelfolder/:meid` | `createtoplevelfolder` | Create a top-level folder or upload a file to root. |
| `POST` | `/createnestedfolder/:idoffolderdoc` | `createnestedfolder` | Create a subfolder or upload a file inside an existing folder. |
| `GET` | `/initiallevelfolders/:meid` | `initiallevelfolders` | Get top-level folder/file references for the initial render. |
| `GET` | `/getfolderdatasbyid/:folderid` | `getfolderdatasbyid` | Get all children of a specific folder (lazy-load on open). |
| `GET` | `/getfoldersize/:folderid` | `getfoldersize` | Calculate total byte size of all files inside a folder (recursive). |
| `DELETE` | `/deletenestedfolder/:meid/:root/:deleteac` | `deletenestedfolder` | Delete folder(s) with all nested content. |
| `DELETE` | `/deleteonlyfiles/:meid/:folderid` | `deleteonlyfiles` | Delete one or more files (Cloudinary + DB). |
| `PUT` | `/renamefolder/:id/:chgname` | `renamefolder` | Rename a folder. |

**Route params explained:**

- `:meid` — The authenticated user's MongoDB `_id`.
- `:root` — `"root"` if the folder being deleted is top-level (needs reference cleanup in the user doc), `"notroot"` otherwise.
- `:deleteac` — Pass `"deleteac"` to also delete the user account after deleting all folders (account deletion flow).

**Request bodies:**

`POST /createtoplevelfolder/:meid`
```json
{ "type": "folder", "foldername": "My Projects" }
// or
{ "type": "file", "file_ids": { "publicid": "...", "url": "...", "name": "...", "bytes": 12345 } }
```

`DELETE /deletenestedfolder/:meid/:root/:deleteac`
```json
{ "arrayoffoldersids": ["<folderId1>", "<folderId2>"] }
```

`DELETE /deleteonlyfiles/:meid/:folderid`
```json
{ "idsoffiletodelete": ["<cloudinary_public_id>"] }
```
Query param: `?level=top` if the file lives in a top-level folder.

---

### Drag & Drop

| Method | Route | Handler | Description |
|---|---|---|---|
| `PUT` | `/handledraganddrop/:currentid/:shiftid/:folderid` | `handledraganddrop` | Move a file or folder from one location to another. |

**Query params:**

- `?type=folder` — Moving a folder.
- `?type=file` — Moving a file from a nested folder.
- `?type=toplevel` — Moving a file from/to the top level.
- `?route=toptobottom` — From root to a nested folder.
- `?route=bottomtotop` — From a nested folder to root.
- (no route) — Nested to nested.

**Route params:**
- `:currentid` — ID of the source location (user doc or folder doc).
- `:shiftid` — ID of the destination location.
- `:folderid` — ID of the item being moved (folder `_id` or file `publicid`).

The handler performs an atomic `$pull` from the source and `$push` to the destination, then updates `parentid` on the moved folder document.

---

### AI Data Feed

| Method | Route | Handler | Description |
|---|---|---|---|
| `GET` | `/getallmydataforai/:meid` | `getallmydataforai` | Returns the full folder tree (via `$graphLookup`) to feed into the AI context. |

---

## Controller Logic

### `signIn` / `logIn`
Standard credential flows. `signIn` creates a new user document (password is hashed by the Mongoose pre-save hook). `logIn` fetches by username and uses `comparehash()` to validate. Both return a signed JWT on success.

### `createtoplevelfolder` / `createnestedfolder`
Both accept `type: "folder"` or `type: "file"`. For folders, a new document is created in `NestedFoldersDataModel` and only its `_id` is pushed into the parent's array. For files, the Cloudinary metadata (already uploaded by the client) is pushed directly. This pattern keeps documents small and the folder tree traversable.

### `deletenestedfolder`
The most complex controller. Uses `$graphLookup` to recursively collect all descendant folder documents. Then:
1. Iterates over every collected document.
2. Extracts all `publicid` values and deletes each file from Cloudinary.
3. Pulls the reference from the parent document (using `parentid`).
4. If top-level, also pulls the reference from the user's root document.
5. Calls `NestedFoldersDataModel.deleteMany()` to remove all collected folder docs in one query.
6. If `:deleteac === "deleteac"`, deletes the user account afterward.

### `deleteonlyfiles`
Iterates over an array of Cloudinary public IDs, calls `cloudinary.v2.uploader.destroy()` for each, then uses `$pull` to remove the file entry from the appropriate document. Supports a special `level=aichat` query to delete AI-chat attachments without touching the DB.

### `getfoldersize`
Uses `$graphLookup` to collect all nested folders, extracts `file_ids.bytes` from every `files_and_nested_folders_ids` array across all collected docs, then sums them with `Array.reduce`.

### `handledraganddrop`
Handles 6 movement scenarios (folder top→nested, folder nested→top, folder nested→nested, file nested→nested, file top→nested, file nested→top). Each scenario does a `$pull` + `$push` pair and, for folders, updates the `parentid` field on the moved document.

---

## Socket.IO — AI Chat

**File:** `src/socketconnection.js`

The Socket.IO server is attached to the raw Node.js `http.Server` instance (not Express) to share the same port.

**Event flow:**

```
Client  ──emit("send", { dataforai: [...messages] })──►  Server
Server  ──►  HuggingFace InferenceClient (Qwen3.6-27B)
Server  ──emit("success", { myai: "<JSON string>" })──►  Client
Server  ──emit("errorinai", { message })──►  Client  (on failure)
```

`data.dataforai` is the full conversation history in OpenAI message format (`[{ role, content }]`). The system prompt is prepended server-side on every request so the client never needs to send it.

The response `myai` is a raw JSON string. The client parses it to extract the endpoint and parameters, then fires the corresponding REST call.

---

## AI Prompt Design

**File:** `src/prompt.js`

The system prompt instructs the LLM to act as a file manager assistant with strict output rules:

- **Output format:** Return only a valid JSON object — no markdown, no explanation.
- **Grounding:** The full `mydata` object (from `/getallmydataforai`) is injected into the conversation so the model can resolve folder/file names to real MongoDB `_id` values. It is explicitly told never to invent IDs.
- **Fallbacks:** Returns `{ "error": "not_found" }` if a name can't be resolved, or `{ "error": "unsupported_action" }` for greetings and unsupported requests.
- **`meid` handling:** The prompt explicitly tells the model that `meid` is pre-set on the backend and must never appear in the response.

**Supported actions the AI can trigger:**

| Action | Endpoint key |
|---|---|
| Create top-level folder or file | `createtoplevelfolder` |
| Create nested folder or upload to folder | `createnestedfolder` |
| Delete a nested folder | `deletenestedfolder` (root: notroot) |
| Delete a top-level folder | `deletenestedfolder` (root: root) |
| Delete file(s) | `deleteonlyfiles` |
| Rename a folder | `renamefolder` |

---

## Environment Variables

| Variable | Description |
|---|---|
| `MONGODBURL` | MongoDB connection string |
| `CLOUDINARY_KEY` | Cloudinary API key |
| `CLOUDINARY_SECRET` | Cloudinary API secret |
| `CLOUDINARY_NAME` | Cloudinary cloud name |
| `JWTSECRET` | Secret key for signing JWTs |
| `HF_TOKEN` | Hugging Face API token |
| `PORT` | Port the HTTP server listens on |

---

## Running Locally

```bash
# Install dependencies
npm install

# Create .env file and populate with variables above

# Start the server
node app.js
```

The server uses top-level `await` (ESM), so Node.js 14.8+ is required. CORS is configured for the deployed frontend origin — update `origins` in `app.js` and `socketconnection.js` for local development.