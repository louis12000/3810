# RE:FOUND · Campus Lost & Found

> **⚠ Three things to change before submission (delete this block afterwards)**
>
> 1. Rename the folder `3810-main` to `comp3810sef_group<group-no>`, e.g. `comp3810sef_group5`.
> 2. Replace the `NULL` values in the "2. Group info" table with real names, SIDs and the work split; fill in `Group no`.
> 3. Delete `node_modules/`, `.env` and `cookies.txt`, then zip the folder as `comp3810sef_group<group-no>.zip`.

---

## 1. Project info

**Project name:** RE:FOUND · Campus Lost & Found

**What it does:** a server-side app for lost and found items on a campus. Students can report
something they lost, register something they found, search everyone's records by keyword and
status, and hand an item back through a claim flow. Admins can list all users and edit or delete
any record. Everything is stored in MongoDB and the sign-in state is a session stored in MongoDB
as well.

**Main features**

- Register / sign in / sign out, passwords hashed with bcrypt
- Full CRUD web pages for lost & found records (own records only, admins excepted)
- Claim flow: `open → claimed → closed`, with reject and reopen
- Two extra status tracks on every record: **claim status** (`unclaimed` / `claimed`, 未領 / 已領)
  and **search status** (`unfound` / `found`, 未找到 / 找到), editable in the form, switchable with
  one click on the detail page, and usable as list filters
- Filtering: my records / all records, type, workflow status, claim status, search status, keyword
- Overview page with four live counters and the newest found items
- My records page with three tabs: found by me, lost by me, my claims
- RESTful CRUD API (no authentication, as the coursework requires), testable with curl
- Admin page: user list, and management of every record

**Tech stack**

| Layer | Used |
| --- | --- |
| Web framework | Express.js 5 |
| Database | MongoDB + Mongoose 9 |
| Views | EJS server-side templates |
| Session | `express-session` + `connect-mongo` (sessions stored in MongoDB) |
| Passwords | `bcryptjs` |
| Security | `helmet`, `express-rate-limit`, HttpOnly cookies, CSP |
| Tests | Node.js `node:test` + `mongodb-memory-server` |

**Mapping to the course technical requirements**

| Requirement (PDF) | Where it lives |
| --- | --- |
| Express.js | `app.js`, `server.js` |
| MongoDB (Mongoose) | `config/db.js`, `models/User.js`, `models/Item.js` |
| Login / logout pages | `routes/auth.js`, `views/login.ejs`, `views/register.ejs` |
| Only authorised users reach the CRUD pages | `middleware/auth.js` (`requireAuth`) |
| CRUD pages have a logout control | `views/partials/header.ejs` (every page) |
| Create / Read / Update / Delete web pages | `routes/items.js`, `views/items/*.ejs` |
| RESTful Read | `GET /api/items`, `GET /api/items/:id` |
| RESTful Create (POST) | `POST /api/items` |
| RESTful Update (PUT) | `PUT /api/items/:id` |
| RESTful Delete | `DELETE /api/items/:id` |
| README structure | sections 1–4 of this file |

## 2. Group info

| Member | Name | SID | Main work |
| --- | --- | --- | --- |
| A | NULL | NULL | Sign-in / registration / sign-out, sessions, `User` model, auth middleware, environment |
| B | NULL | NULL | Lost & found CRUD web pages (`models/Item.js`, `routes/items.js`, `views/items/`) |
| C | NULL | NULL | RESTful CRUD API (`routes/api-items.js`, `lib/item-query.js`) |
| D | NULL | NULL | UI and CSS, claim flow, tests, README, demo slides |

**Group no:** `NULL`
**Course:** COMP 3810SEF Autumn 2026

## 3. Project file intro

```text
comp3810sef_group<group-no>/
├── server.js               # entry point: connect MongoDB, start Express, handle shutdown
├── app.js                  # Express app: EJS, sessions, routes, 404 and error handling
├── package.json            # dependencies and npm scripts
├── .env.example            # environment variable template (safe to submit)
├── config/
│   ├── env.js              # read and validate environment variables
│   ├── db.js               # Mongoose connect / disconnect
│   └── session.js          # express-session + connect-mongo
├── models/
│   ├── User.js             # user schema, bcrypt hashing, public fields
│   └── Item.js             # item schema, shared validation, serialisation
├── middleware/
│   ├── auth.js             # loadUser, requireAuth, requireAdmin, owner check
│   └── flash.js            # EJS locals (appName, currentUser, formatDate…) and flash messages
├── lib/
│   └── item-query.js       # shared filtering / keyword query for pages and API
├── routes/
│   ├── auth.js             # sign-in, register, sign-out, /api/auth/*
│   ├── pages.js            # / (overview), /me (my records), /admin/users, /api/health
│   ├── items.js            # web CRUD + claim flow (requires sign-in)
│   └── api-items.js        # RESTful CRUD API (no sign-in, per coursework)
├── views/
│   ├── partials/           # header, footer, item row
│   ├── items/              # index, new, edit, show, _form
│   ├── home.ejs            # overview page
│   ├── me.ejs              # my records page
│   ├── login.ejs
│   ├── register.ejs
│   ├── admin-users.ejs
│   └── error.ejs
├── public/
│   ├── styles.css          # design system (dark navy + ice blue), no CSS framework
│   └── app.js              # the only client script: confirm dialogs for destructive forms
├── scripts/
│   ├── seed.js             # create / reset the two test accounts
│   ├── seed-demo.js        # six demo records (handy for the demo and screenshots)
│   ├── check-env.js        # check Node, MongoDB, users, items and sessions
│   └── setup-ubuntu.sh     # one-shot Ubuntu setup: deps, .env, seed
├── test/
│   ├── auth.test.js        # sign-in / session / permission tests
│   └── items.test.js       # web CRUD + RESTful API tests
├── docs/                   # optional demo GIF
└── README.md
```

| File / folder | Purpose |
| --- | --- |
| `server.js` | Program entry: connect to MongoDB, listen, handle SIGINT/SIGTERM. |
| `app.js` | Builds the Express app: EJS, helmet CSP, body parsing, static files, session, routes, 404 and error handling. |
| `package.json` | Dependencies and `start` / `seed` / `seed:demo` / `check` / `test` scripts. |
| `public/` | Static assets: one stylesheet and one small script. |
| `views/` | EJS templates. `partials/` holds the shared header, footer and row; `items/` holds the CRUD pages. |
| `models/` | Mongoose schemas. `User` handles accounts, `Item` handles records; validation lives on the model so pages and API share it. |
| `routes/` | Routing. `items.js` is the web CRUD (sign-in required), `api-items.js` is the REST API (no sign-in). |
| `lib/` | Query logic shared by the web list and the API. |
| `test/` | Integration tests; `mongodb-memory-server` starts a throwaway database, so no local MongoDB is needed. |

## 4. Setup (UTM / Ubuntu)

Ubuntu 24.04 (noble) is assumed. On 22.04 replace `noble` with `jammy`.

### 4.0 快速啟動（中文）

如果 Node.js 20+ 與本機 MongoDB 8 已經裝好，五步就能啟動：

```bash
cd 3810-main                 # 專案根目錄（交功課前要改名為 comp3810sef_group<組號>）
cp .env.example .env         # 只做一次；已經有 .env 就跳過
# 打開 .env，把 SESSION_SECRET 換成 openssl rand -hex 48 產生的字串
npm install                  # 只做一次
npm run seed && npm run seed:demo
npm start
```

啟動成功應該見到（DB 名稱取決於 `.env` 的 `MONGODB_URI`）：

```text
[db] MongoDB connected: 127.0.0.1/comp3810sef_groupX
[server] Campus Lost & Found running at http://127.0.0.1:3000
```

然後用瀏覽器開 <http://127.0.0.1:3000/>，用 `admin@campus.test` / `Admin@3810Demo`
或 `student@campus.test` / `Student@3810Demo` 登入。

`.env` 最小內容（其餘可以用預設值）：

```dotenv
PORT=3000
HOST=127.0.0.1
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/comp3810sef_groupX
SESSION_SECRET=<32 個字元以上，用 openssl rand -hex 48 產生>
SESSION_MAX_AGE_MS=3600000
COOKIE_SECURE=false
TRUST_PROXY=0
```

⚠️ `.env` 被 `.gitignore` 排除，不會進 zip；拿到專案的人要自己重建一次。
另外 `npm start` 之前請確認 `mongod` 正在跑（`sudo systemctl status mongod`），
否則會停在 `MongooseServerSelectionError`。

### 4.1 Install Node.js 20+

```bash
node -v
npm -v
```

If missing or older than 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

### 4.2 Install MongoDB 8.0

```bash
sudo apt-get update
sudo apt-get install -y gnupg curl

curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list

sudo apt-get update
sudo apt-get install -y mongodb-org

sudo systemctl enable --now mongod
sudo systemctl status mongod --no-pager
```

Check it:

```bash
mongosh --eval 'db.runCommand({ ping: 1 })'
```

### 4.3 Install the project

```bash
cd comp3810sef_group<group-no>
npm install
```

### 4.4 Create `.env`

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Put the generated string into `SESSION_SECRET`. The default database is the local MongoDB
instance: `mongodb://127.0.0.1:27017/comp3810sef_groupX` (change it in `.env` if your MongoDB
listens somewhere else, or if you point the app at an Atlas cluster).

### 4.5 Create the test accounts and demo data

```bash
npm run seed
npm run seed:demo   # optional: six demo records
npm run check
```

### 4.6 Start

```bash
npm start
```

Expected output:

```text
[db] MongoDB connected: 127.0.0.1/comp3810sef_groupX
[server] Campus Lost & Found running at http://127.0.0.1:3000
```

Open <http://127.0.0.1:3000/>.

### 4.7 Open it from the macOS host (optional)

By default `HOST=127.0.0.1`, so the app only listens inside the VM. To reach it from macOS:

1. UTM → your VM → Settings → Network → Port Forwarding.
2. Add a rule: Host port `3000` → Guest port `3000`.
3. Set `HOST=0.0.0.0` in `.env` and restart with `npm start`.
4. Open <http://127.0.0.1:3000/> in macOS.

## 5. User flow

### 5.1 Valid login details

`npm run seed` creates two accounts (passwords come from `SEED_*` in `.env`):

| Role | Email | Password | Can do |
| --- | --- | --- | --- |
| Admin | `admin@campus.test` | `Admin@3810Demo` | Everything, plus user management and editing / deleting any record |
| Student | `student@campus.test` | `Student@3810Demo` | CRUD on own records, browse and claim others' records |

You can also register from the sign-in page; new accounts are always `student`. Admin accounts
are created by the seed script (or directly in the database).

### 5.2 Sign in / sign out

- Sign in at `/login`; on success you land on `/` (the overview).
- Sign out with the button in the top-right corner. It is on every signed-in page, as the
  coursework requires. Signing out deletes the session and clears the cookie.
- Opening `/`, `/items`, `/me` or `/admin/users` while signed out redirects to
  `/login?next=...`, and you return to the requested page after signing in.

### 5.3 Web CRUD: which button does what

The top navigation has **Overview**, **Lost & found** and **My records**.

| Operation | How |
| --- | --- |
| **Create** | On the overview or the list page press **+ Report a lost item** or **+ Register a found item**, fill the form, press **New record**. Both entries share one form; only the `type` default differs. |
| **Read** | Open **Lost & found** → search, filter by status, or use the chips for *My records / All records* and *All types / Lost / Found* → click a row to open the detail page. The overview also lists the newest found items. |
| **Update** | On the detail page press **Edit** (only the owner or an admin sees it) → change the fields → **Save changes**. |
| **Delete** | On the detail page press **Delete record**; a confirmation dialog appears first (handled by `public/app.js`). |

**Claim flow** (deliberately separate from the edit form, so the status cannot be set by hand):

| Step | Who | Button | Status change |
| --- | --- | --- | --- |
| 1 | Any signed-in user except the owner | **This is mine** / **I found it** | `open` → `claimed`, records the claimant and the message |
| 2 | Owner or admin | **Confirm handover** | `claimed` → `closed` |
| 2' | Owner or admin | **Reject / reopen** | `claimed` → `open`, clears the claim |

A claimant cannot confirm their own claim (403), and nobody can claim their own record.

**Claim status and search status** are two extra tracks on top of the workflow above:

| Track | Values | Where to change it |
| --- | --- | --- |
| Claim status | `unclaimed` (未領) / `claimed` (已領) | **Edit** form → *Claim status*, or the **Mark as claimed / Mark as unclaimed** button on the detail page (owner or admin) |
| Search status | `unfound` (未找到) / `found` (找到) | **Edit** form → *Search status*, or the **Mark as found / Mark as not found** button on the detail page (owner or admin) |

- The list page has a dropdown for each of them (`All claim statuses`, `All search statuses`), and
  the two filters stack: e.g. `/items?claimStatus=unclaimed&searchStatus=found`.
- Confirming a handover also writes `claimed` / `found`; reopening resets them to
  `unclaimed` / `unfound`, so the three status fields never contradict each other.
- Records created before this feature existed simply default to `unclaimed` / `unfound`.

### 5.4 Permissions at a glance

| Page / API | Signed out | Student | Admin |
| --- | --- | --- | --- |
| `/login`, `/register` | allowed | redirected to `/` | redirected to `/` |
| `/`, `/items`, `/items/:id` | redirected to sign-in | 200 | 200 |
| `/items/new`, `POST /items` | redirected | 200 | 200 |
| `/items/:id/edit`, `POST /items/:id` | redirected | own records only, otherwise 403 | any record |
| `POST /items/:id/delete` | redirected | own records only, otherwise 403 | any record |
| `POST /items/:id/claim` | redirected | allowed (not on own record) | allowed |
| `POST /items/:id/confirm`, `/reopen` | redirected | own records only | any record |
| `POST /items/:id/claim-status`, `/search-status` | redirected | own records only | any record |
| `/me` | redirected | 200 | 200 |
| `/admin/users` | redirected | 403 | 200 |
| `/api/items` and friends | allowed (coursework requirement) | allowed | allowed |

### 5.5 Record fields and statuses

| Field | Meaning |
| --- | --- |
| `title` | Item name, 3–120 characters |
| `description` | Free text, up to 1000 characters |
| `type` | `lost` or `found` |
| `category` | `electronics` / `books` / `documents` / `keys` / `accessories` / `clothing` / `other` |
| `location` | Where it was lost or found |
| `occurredAt` | Date (`YYYY-MM-DD`, never in the future) |
| `status` | `open` → `claimed` → `closed` (driven by the claim flow) |
| `claimStatus` | `unclaimed` (未領) or `claimed` (已領) — has the item been claimed / collected? |
| `searchStatus` | `unfound` (未找到) or `found` (找到) — has the item been recovered? |
| `owner` | Who registered it; records created through the API may have no owner |
| `claimedBy`, `claimMessage`, `claimedAt` | Who claimed it, their message and when |

## 6. RESTful CRUD API

Per the coursework these endpoints **need no authentication**, so curl works directly.
Run the commands in the project folder while the server is listening on `http://127.0.0.1:3000`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api` | list every endpoint |
| GET | `/api/items` | list, supports `type` / `status` / `claimStatus` / `searchStatus` / `category` / `q` / `owner` / `limit` / `skip` |
| GET | `/api/items/:id` | read one |
| POST | `/api/items` | create (201 + `Location`) |
| PUT | `/api/items/:id` | update, partial updates allowed |
| DELETE | `/api/items/:id` | delete |

> The web pages require a signed-in session; the REST API does not. Both share the same
> `Item` model and the same validation; the only difference is that `routes/items.js` adds
> `requireAuth` and the owner check.

### 6.1 Health check

```bash
curl -i http://127.0.0.1:3000/api/health
```

```json
{"status":"ok","database":"connected"}
```

### 6.2 Read: list

```bash
curl -i http://127.0.0.1:3000/api/items
```

```bash
# found items, still open, containing "earphones", at most 5
curl -s "http://127.0.0.1:3000/api/items?type=found&status=open&q=earphones&limit=5"

# claim status and search status are filters too, and they stack
curl -s "http://127.0.0.1:3000/api/items?claimStatus=unclaimed&searchStatus=unfound"
curl -s "http://127.0.0.1:3000/api/items?claimStatus=claimed"
```

Example response (`id`, timestamps and totals depend on your data):

```json
{
  "count": 1,
  "total": 1,
  "limit": 5,
  "skip": 0,
  "keyword": "earphones",
  "items": [
    {
      "id": "6730a1f2c9e4b80012ab34cd",
      "title": "White AirPods Pro charging case",
      "type": "found",
      "typeLabel": "Found",
      "category": "electronics",
      "categoryLabel": "Electronics",
      "status": "open",
      "statusLabel": "Open",
      "claimStatus": "unclaimed",
      "claimStatusLabel": "Unclaimed",
      "searchStatus": "unfound",
      "searchStatusLabel": "Not found yet",
      "location": "Sports Centre, Court 2",
      "owner": { "id": "67309c11c9e4b80012ab3401", "name": "Demo Student" },
      "claimedBy": null
    }
  ]
}
```

### 6.3 Read: single record

```bash
curl -i http://127.0.0.1:3000/api/items/<ITEM_ID>
```

A missing id returns `404`:

```bash
curl -i http://127.0.0.1:3000/api/items/000000000000000000000000
```

### 6.4 Create (POST)

```bash
curl -i \
  -H "Content-Type: application/json" \
  -d '{"title":"Black umbrella","type":"lost","category":"accessories","location":"Library","description":"White sticker on the handle"}' \
  http://127.0.0.1:3000/api/items
```

Returns `201 Created` with a `Location` header. A missing `title` or an invalid `type` returns `400`:

```bash
curl -i -H "Content-Type: application/json" -d '{"type":"stolen"}' \
  http://127.0.0.1:3000/api/items
```

```json
{
  "message": "Invalid input",
  "errors": [
    { "field": "title", "message": "Title must be between 3 and 120 characters" },
    { "field": "type", "message": "Type must be lost or found" }
  ]
}
```

### 6.5 Update (PUT)

Only send the fields you want to change:

```bash
curl -i -X PUT \
  -H "Content-Type: application/json" \
  -d '{"status":"claimed"}' \
  http://127.0.0.1:3000/api/items/<ITEM_ID>
```

Or several at once:

```bash
curl -i -X PUT \
  -H "Content-Type: application/json" \
  -d '{"title":"Black umbrella (found)","status":"closed","location":"Library service desk"}' \
  http://127.0.0.1:3000/api/items/<ITEM_ID>
```

Setting `claimed` fills `claimedAt`, setting `closed` fills `closedAt`, and setting `open`
clears the claim fields.

The two extra statuses are plain fields, so they can be updated on their own:

```bash
curl -i -X PUT \
  -H "Content-Type: application/json" \
  -d '{"claimStatus":"claimed","searchStatus":"found"}' \
  http://127.0.0.1:3000/api/items/<ITEM_ID>
```

```json
{
  "message": "Updated, status: Claim pending, claim: Claimed, search: Found",
  "item": { "...": "the whole record with claimStatus / searchStatus" }
}
```

An unknown value returns `400` with `{"field":"claimStatus"}` (or `searchStatus`) in `errors`.

### 6.6 Delete

```bash
curl -i -X DELETE http://127.0.0.1:3000/api/items/<ITEM_ID>
```

```json
{"message":"Deleted","deleted":{"id":"6730a1f2c9e4b80012ab34cd","title":"Black umbrella"}}
```

### 6.7 Auth-related endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/me` | current user, 401 when signed out |
| POST | `/api/auth/login` | JSON sign-in, sets the cookie |
| POST | `/api/auth/register` | JSON registration, signs in automatically |
| POST | `/api/auth/logout` | sign out |

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"email":"student@campus.test","password":"Student@3810Demo"}' \
  http://127.0.0.1:3000/api/auth/login

curl -i -b cookies.txt http://127.0.0.1:3000/api/auth/me
```

## 7. Automated tests

```bash
npm test
```

The suite starts a throwaway MongoDB through `mongodb-memory-server`, so no local database is
needed. 60 tests in two files:

**`test/auth.test.js` (20 tests)** — redirects and 401s, sign-in / register / sign-out, 403 on the
admin page, the 429 rate limit, and that the server never prints seed passwords.

**`test/items.test.js` (40 tests)** — web CRUD (create, validation errors, filters, edit, delete),
owner and admin permissions, the claim flow, the claim status / search status fields (defaults,
edit form, quick switches, invalid values), invalid ids returning 404, and every REST endpoint
including 400 / 404 handling and JSON error bodies.

> The first `npm test` downloads a MongoDB binary for testing (about 100–780 MB depending on the
> version) and caches it. On a network that blocks the download, skip the suite and walk through
> the curl commands in section 6 plus the four web operations by hand.

## 8. Troubleshooting

### `MongooseServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017`

MongoDB is not running:

```bash
sudo systemctl start mongod
sudo systemctl status mongod --no-pager
```

### `SESSION_SECRET must be at least 32 characters`

`.env` is missing it or the value is too short:

```bash
cp .env.example .env
openssl rand -hex 48      # put the output after SESSION_SECRET=
```

Or let the setup script do it: `bash scripts/setup-ubuntu.sh`.

> 中文：`.env` 不存在或 `SESSION_SECRET` 太短。最常見的原因是只解壓了 zip、未建立 `.env`
> （`.env` 不會入 zip）。照上面兩行做即可，或直接跑 `bash scripts/setup-ubuntu.sh`。

### Sign-in keeps failing

Check the seed accounts:

```bash
npm run check
```

If `users=0`, run `npm run seed`.

### Port 3000 already in use

```bash
sudo lsof -i :3000
```

Or change `PORT` in `.env`.

### The VM's port 3000 is not reachable from macOS

By default `HOST=127.0.0.1` only listens inside the VM; see 4.7 for port forwarding.

### `npm test` hangs while downloading MongoDB

`mongodb-memory-server` needs the network for its test binary. If the download is blocked, skip
the suite and verify by hand instead.

## 9. Security and submission notes

- Never commit `.env`; `.gitignore` already excludes it.
- Passwords are bcrypt hashes, never plain text, and the failure message does not reveal whether
  the email or the password was wrong.
- The session cookie is `HttpOnly` + `SameSite=Lax`, and signing in regenerates the session id.
- In production set `COOKIE_SECURE=true` and serve over HTTPS.
- The forms have no CSRF token yet; add CSRF protection before any public deployment.
- Rate limiting is in memory; a multi-instance deployment needs a shared store.
- The only client script (`public/app.js`) is served from the app itself, which is why the strict
  CSP (`script-src 'self'`, `script-src-attr 'none'`) still allows the delete confirmation.
- Remove `node_modules/`, `.pnpm-store/`, `.env` and `cookies.txt` before zipping.
- Name the folder `comp3810sef_group<group-no>` (the PDF requires it; `3810-main` will lose
  marks) and the archive `comp3810sef_group<group-no>.zip`.
- Before submitting, repeat the setup in a clean folder: `cp .env.example .env` → set the secret →
  `npm install` → `npm run seed` → `npm start`.

## 10. Known limitations

- The list shows at most 100 records and has no pagination.
- Items are text only; there is no image upload (the model has no image field).
- The REST API needs no authentication, as the coursework requires; add an API key or sign-in
  before exposing it publicly.
- There is no password reset and no email verification.
- There is no map view: `location` is free text, so records cannot be placed on a plan yet.
- The interface is dark only; a light theme would need a client-side toggle.
