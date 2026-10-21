# The Daily Web

The Daily Web is a university final project for managing, editing and
publishing news. Guests read approved stories and comment, Reporters write and
revise articles, and Editors review, publish, manage users and follow the
impact of every update.

## Main features

**Home page (all visitors)**
- News feed of approved articles only, with infinite scrolling that loads 20
  more articles near the bottom of the feed.
- Title search, category and viewed/not-viewed filters, and sorting by
  publication date or popularity. Search, filters, sorting and loading more
  happen without reloading the page.
- Each card shows the title, image, summary, category, reporter and
  publication date, and links to the full article.
- A weather widget in the sidebar.

**Article page (all visitors)**
- Server-rendered title, reporter, category, publication date, main image and
  full content, so the article is readable by search engines without
  JavaScript.
- Comments list and form. A new comment appears at once without reloading the
  list. A guest may post at most 3 comments per minute from the same device;
  the server blocks further attempts and explains why.
- Every visit is counted in the view statistics.

**Login**
- Reporters and Editors sign in with a username and password. A Reporter is
  sent to their workspace and an Editor to the management area.

**Reporter workspace**
- Lists the Reporter's own articles with their status, with paging that does
  not reload the page.
- Create an article, edit it while it is in preparation, submit it for
  approval, read the Editor's note on a returned article, correct it and
  submit it again, and edit an article that is already published.
- Work is saved automatically while typing and when the page is closed,
  reloaded or hidden. Returning on any computer opens the latest saved
  version.

**Editor management area**
- All articles, with title search, status filter and paging that do not
  reload the page.
- For an article awaiting approval: view the submission, edit it, approve and
  publish it, or return it to the Reporter with a required note. Any article
  can be deleted.
- For an update to a published article, the current public version and the
  new pending version are shown side by side.
- User administration (create, search, edit, reset password, delete) and
  comment moderation (edit, delete) from the article page.

**Impact Analytics (Editors)**
- A Canvas graph of each article's views over time, with every initial
  publication and approved update marked on the timeline, and a comparison of
  views in the 24 hours before and after each update.
- The hourly view statistics behind the graph can be added, edited and
  deleted from the same page.

## Technology

- Node.js and Express, following the MVC pattern
- MongoDB with Mongoose
- EJS views, semantic HTML5 and responsive CSS (Flexbox)
- Vanilla JavaScript with Fetch (Ajax) in the browser, and Canvas for the graph
- REST endpoints for the data interfaces
- Weather from the free Open-Meteo service (no API key or payment details)

The only npm dependencies are `express`, `mongoose` and `ejs`.

## Prerequisites

- **Node.js 22 or newer** (includes npm)
- **MongoDB 7 or newer**, running locally on the default port 27017:
  - macOS (Homebrew):
    ```sh
    brew tap mongodb/brew
    brew install mongodb-community
    brew services start mongodb-community
    ```
  - Windows: install *MongoDB Community Server* and keep the option
    *Install MongoD as a Service* selected. It then starts with Windows.
  - Linux: install `mongodb-org` from the MongoDB repository and run
    `sudo systemctl start mongod`.

## Installation and running

The same commands work on macOS, Windows and Linux. Run them in the project
folder:

```sh
npm install     # install express, mongoose and ejs
npm run seed    # load the demo data and print the demo passwords
npm start       # start the server
```

Open <http://localhost:3000>.

The server, `npm run seed` and `npm run verify-demo` all use the local
database `web-daily-demo` by default, so the seeded data appears in the site
without any configuration. Stop the server with `Ctrl+C`.

### Configuration (optional)

Settings are read from environment variables. The application does not load
`.env` files.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/web-daily-demo` | MongoDB connection |
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | unset | `production` enables HTTPS-only cookies and hides stack traces in logs |
| `WEATHER_LATITUDE` | `32.0853` | Weather latitude |
| `WEATHER_LONGITUDE` | `34.7818` | Weather longitude |
| `WEATHER_LOCATION_NAME` | `Tel Aviv` | Displayed weather location |

Setting a variable for one run:

```sh
# macOS / Linux
PORT=4000 npm start
```

```powershell
# Windows PowerShell
$env:PORT = '4000'; npm start
```

```bat
:: Windows Command Prompt
set "PORT=4000" && npm start
```

## Demo data

`npm run seed` replaces only the records owned by the demo accounts and keeps
everything else. As a safety check it refuses any database whose name does not
start with `web-daily-demo`, so a different `MONGO_URI` must name a database
such as `web-daily-demo-2`.

The seed contains 540 articles in every status across eight categories, 434
publicly visible articles, 867 comments, 30 days of view statistics, and 66
articles that were updated after publication (48 of them at least twice).
`npm run verify-demo` checks these counts and the integrity of users, password
hashes, publication history, comments and statistics.

### Demo accounts

| Role | Usernames |
| --- | --- |
| Reporter | `demo_reporter_1` through `demo_reporter_4` |
| Editor | `demo_editor_1` and `demo_editor_2` |

No password is stored in the repository. Each run of `npm run seed` generates
new passwords (one for all Reporters, one for all Editors), saves only their
hashes in the database and prints them once at the end of its output:

```text
DEMO ACCOUNTS — new passwords on every seed run; previous ones no longer work
  reporter  demo_reporter_1   password: <generated>
  ...
  editor    demo_editor_1     password: <generated>
```

Copy them from the terminal. Running the seed again resets the demo data and
replaces the passwords.

## Article workflow

An article is always in one of four statuses:

| Status | Shown as | Meaning |
| --- | --- | --- |
| `draft` | In preparation | The Reporter is writing it |
| `pending` | Awaiting editor approval | Submitted, waiting for an Editor |
| `published` | Published | The approved version is public |
| `returned` | Returned for corrections | Sent back with an Editor's note |

`utils/articleWorkflow.js` lists every allowed status change; the server
refuses any other:

| From | To | Who |
| --- | --- | --- |
| In preparation | Awaiting editor approval | Reporter (own article) |
| Returned for corrections | Awaiting editor approval | Reporter (own article) |
| Awaiting editor approval | Published | Editor |
| Awaiting editor approval | Returned for corrections (with a note) | Editor |
| Published | In preparation | Reporter starts editing a published article |
| Published | Awaiting editor approval | Editor edits a published article |

Each article keeps two versions. `workingVersion` holds the work in progress
and `publishedVersion` holds the last approved version, which is the only one
readers see. Editing a published article changes only `workingVersion`, so
readers keep seeing the approved version while the new version is written,
submitted and reviewed. Approval copies the working version to the public one
and adds an entry to `publicationHistory`, which the analytics graph marks.
Revision checks stop two simultaneous actions from overwriting each other.

## REST interface

Resources are addressed by URL and the HTTP method states the action. HTML
forms can only send GET and POST, so forms that update or delete send POST
with a hidden `_method` field, which `middleware/methodOverride.js` turns into
PATCH, PUT or DELETE.

| Method | URL | Action | Access |
| --- | --- | --- | --- |
| GET | `/api/feed` | List and search published articles (20 per page) | Everyone |
| POST | `/api/feed` | The same search when the viewed-article list is too long for a URL | Everyone |
| GET | `/api/feed/categories` | List categories | Everyone |
| GET | `/api/weather` | Current weather | Everyone |
| GET | `/articles/:id` | Article page | Everyone |
| GET | `/api/articles/:id/comments` | List comments (paged) | Everyone |
| POST | `/api/articles/:id/comments` | Add a comment | Everyone |
| PATCH / DELETE | `/api/comments/:id` | Edit / delete a comment | Editor |
| POST | `/login`, `/logout` | Sign in / sign out | — |
| POST | `/reporter/articles` | Create an article | Reporter |
| PATCH | `/reporter/articles/:id` | Autosave changed fields | Reporter (own) |
| PATCH | `/reporter/articles/:id/status` | Submit for approval (`status: pending`) | Reporter (own) |
| PATCH | `/editor/articles/:id` | Edit an article | Editor |
| PATCH | `/editor/articles/:id/status` | Approve (`published`) or return (`returned` + `editorNote`) | Editor |
| DELETE | `/editor/articles/:id` | Delete an article | Editor |
| POST | `/editor/users` | Create a user | Editor |
| PATCH / DELETE | `/editor/users/:id` | Edit / delete a user | Editor |
| GET / POST | `/editor/analytics/:id/stats` | List / add view statistics | Editor |
| GET / PATCH / DELETE | `/editor/analytics/:id/stats/:statId` | Read / edit / delete view statistics | Editor |

The Editor and Reporter list pages (`/editor`, `/editor/users`, `/reporter`)
return the whole page for a normal request and only the results section for
an Ajax request (`X-Requested-With: XMLHttpRequest`).

## Feed, analytics and weather

The feed reads 20 articles at a time with MongoDB cursor pagination and
indexes, so it stays fast with thousands of articles. Search matches any part
of approved titles and ignores case. The viewed filter uses the article IDs
stored in the browser under the `dailyWebViewedArticles` localStorage key.

Every successful article page view atomically increments one hourly
`ViewStat` document and the article's popularity counter. Storing one
document per article per hour, instead of one per view, keeps the data small
when thousands of readers view articles at the same time.

Open-Meteo responses are cached on the server for five minutes and shared by
all visitors, so thousands of readers cause one external request at a time.
If a refresh fails, data younger than 15 minutes is still served and the
service is retried after a minute. Older data is never shown, and the widget
shows when the data was last updated.

## Security

- Passwords are stored only as scrypt hashes with a random salt per user.
- Sessions are random tokens stored in MongoDB as SHA-256 hashes and sent in
  HTTP-only SameSite cookies. They survive server restarts, expire after
  seven days and are removed on sign-out.
- Every permission is checked on the server using the user loaded from the
  database. Guests can reach only the public pages, Reporters can change only
  their own articles and cannot publish, and Editors can manage all content.
- The guest comment limit is stored in MongoDB, so it holds across
  simultaneous requests and server restarts. Changing headers cannot reset it.

## Validation, errors and logging

The server validates IDs, types, lengths, cursors, ownership, roles and status
changes. EJS escaping and DOM `textContent` protect article and comment text.
Central error middleware handles malformed input, validation errors,
conflicts, database outages, missing pages and unexpected errors without
crashing. Browsers receive a styled error page with a way back, and API
clients receive JSON. Signed-out visitors to protected pages are sent to the
login page.

The logger writes JSON lines to the console and to daily files in `logs/`
(ignored by Git). It records errors and significant operational events, never
passwords, cookies, tokens or request bodies.

## Checks and tests

```sh
npm run check          # syntax, imports, EJS templates and static paths
npm test               # server tests against temporary MongoDB databases
npm run test:browser   # tests in a real headless browser
```

The browser tests find Chrome, Edge or Chromium in the usual install
locations on macOS, Windows and Linux. For another location, set
`BROWSER_PATH` to the browser executable.

## Project structure

```text
app.js                 Express setup, middleware order, routes and startup
config/db.js           MongoDB connection and default database
models/                Mongoose models: User, Session, Article, Comment,
                       CommentRateLimit, ViewStat
controllers/           Request handlers for each area (public, auth, reporter,
                       editor, users, comments, feed, analytics, weather)
routes/                URL and HTTP method mapping for each area
middleware/            Authentication and roles, method override, view
                       tracking, 404 and error handling
services/              Database and external-service logic (comments, users,
                       view statistics, weather)
utils/                 Article workflow rules, validation, passwords, session
                       tokens and logging
views/                 EJS pages
  partials/            Shared page headers
  public/ auth/        Home, article and login pages
  reporter/ editor/    Workspace pages and their Ajax result partials
public/css/            Responsive stylesheets
public/js/             Browser scripts: feed, comments, view tracking, weather,
                       autosave editor, list updates, analytics graph
scripts/               Project check, demo seed and demo verification
tests/                 Server, browser, operations and seed tests
```
