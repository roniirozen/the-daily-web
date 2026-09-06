# The Daily Web

The Daily Web is a university final project for managing and publishing news.
Guests browse approved stories and comments, Reporters write and submit
revisions, and Editors review publications, manage users, moderate comments,
and inspect publication impact.

## Technology and prerequisites

- Node.js 22 or newer and npm
- MongoDB 7 or newer
- Express 5, Mongoose 8 and EJS
- Semantic HTML5, responsive CSS, Vanilla JavaScript, Fetch/Ajax and Canvas

No frontend framework, API key, or paid external service is required. Weather
comes from the free Open-Meteo service through the application server.

## Installation and startup

```console
npm install
npm start
```

Open `http://localhost:3000`. Configuration is read from the process environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/web-daily` | MongoDB connection |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | unset | Use `production` for secure HTTPS-only cookies and private error output |
| `WEATHER_LATITUDE` | `32.0853` | Weather latitude |
| `WEATHER_LONGITUDE` | `34.7818` | Weather longitude |
| `WEATHER_LOCATION_NAME` | `Tel Aviv` | Displayed weather location |

The application does not load `.env` automatically. `.env`, `node_modules/`,
and generated `logs/` files are ignored by Git.

## Demo data

The seed command requires both `DEMO_SEED=true` and a disposable database named
`web-daily-demo` (optionally with a suffix). It replaces records owned by demo
accounts and preserves unrelated records.

```powershell
$env:DEMO_SEED = 'true'
$env:MONGO_URI = 'mongodb://127.0.0.1:27017/web-daily-demo'
npm run seed
npm run verify-demo
```

The seed contains 540 articles, 434 public snapshots, eight categories, all
workflow states, 867 comments, 30 days of view statistics, and many stories
with multiple approvals. `npm run verify-demo` checks these counts and the
integrity of users, hashes, article history, comments, and statistics.

Demo-only credentials:

| Role | Username | Password |
| --- | --- | --- |
| Reporter | `demo_reporter_1` through `demo_reporter_4` | `DemoReporter!2026` |
| Editor | `demo_editor_1` and `demo_editor_2` | `DemoEditor!2026` |

Never use these demo passwords outside a disposable local database.

## Roles and features

- Guests search, filter, sort, and infinitely scroll approved news; read
  server-rendered articles; post comments; and view cached weather.
- Reporters create incomplete drafts, use automatic server saves, edit only
  their own articles, submit work, read correction notes, and resubmit.
- Editors search/filter all articles, edit pending submissions, approve or
  return them with a required note, delete articles, manage users, moderate
  comments, and inspect or administer view statistics.

Passwords use Node `scrypt` with random salts. Random session tokens are stored
in MongoDB only as SHA-256 hashes. HTTP-only SameSite cookies carry the raw
token; sessions survive server restarts, expire after seven days, and are
removed on logout. Roles always come from the database-loaded user.

Guests may post at most three comments per rolling minute per network identity.
MongoDB enforces the quota atomically across concurrent requests and processes;
changing a client device ID, User-Agent, or forwarded address cannot reset it.

## Publishing workflow

```text
draft -> pending -> published
                   returned -> pending
published -> draft -> pending -> published
```

`workingVersion` contains unpublished work. `publishedVersion` is the approved
public snapshot. A later draft, pending submission, or returned revision leaves
the existing public snapshot visible. Approval copies the working fields to the
public snapshot and adds an initial/update entry to `publicationHistory`.
Conditional revision checks protect autosave, submission, and Editor actions
from stale concurrent writes.

## Feed, analytics and weather

The feed reads exactly 20 articles at a time with MongoDB cursor pagination.
Search covers approved titles; category, viewed/unviewed, publication date, and
popularity criteria can be combined. Viewed state uses the shared
`dailyWebViewedArticles` localStorage key and tolerates unavailable storage.

Every successful public article response atomically increments one hourly
`ViewStat` bucket and the popularity counter. The Editor Canvas graph marks the
initial publication and updates and compares views in the 24 hours around each
update. Editor-only statistics CRUD is under `/editor/analytics/:id/stats`.

Open-Meteo responses are cached on the server for less than 15 minutes.
Concurrent callers share a single external request, and expired data is hidden
if a refresh fails.

## Validation, errors and logging

Server routes validate IDs, types, lengths, cursors, ownership, roles, and legal
workflow transitions. EJS escaped output and DOM `textContent` protect article
and comment text. Central error middleware handles malformed JSON, validation,
conflicts, database failures, 404s, and unexpected errors without exposing
production stack traces.

The built-in logger writes JSON lines to the console and daily files in `logs/`.
It records operational events and errors using allowlisted metadata. Passwords,
hashes, salts, cookies, tokens, bodies, query strings, environment values, and
raw error messages are not logged.

## Checks and tests

```console
npm run check
npm test
npm run test:browser
```

`npm run check` verifies JavaScript syntax, local imports, EJS compilation,
view/static references, and conflict markers. Server tests use isolated temporary
MongoDB databases. Browser tests use installed Chrome, Edge, or Chromium through
the built-in DevTools protocol; set `BROWSER_PATH` for another location.

## Project structure

- `app.js` — Express configuration, routes, errors, and server lifecycle
- `config/` — MongoDB connection
- `models/` — User, Session, Article, Comment, CommentRateLimit, and ViewStat
- `controllers/` and `routes/` — MVC HTTP endpoints
- `middleware/` — authentication, view tracking, 404, and errors
- `services/` and `utils/` — database operations, weather, validation, and logs
- `views/` — EJS pages for guests, Reporters, and Editors
- `public/` — responsive CSS and Vanilla JavaScript/Ajax
- `scripts/` — checks and guarded demo seed/verification
- `tests/` — server, browser, concurrency, performance, and operations tests
