# The Web Daily

Final project for the Web Applications Development course.

## Technology

- Node.js
- Express
- MongoDB + Mongoose
- EJS
- HTML5
- CSS
- Vanilla JavaScript
- Ajax

## Current stage

Authentication, reporter drafting/submission, and public approved article pages are integrated. Editor approval, the live feed, comments backend, analytics, and weather remain future work.

## Run locally

1. Install dependencies:
   npm install
2. Make sure MongoDB is running locally, or set `MONGO_URI` in the environment.
3. Start the server:
   npm start
4. Open:
   http://localhost:3000

## Environment and operational logging

Set `MONGO_URI` for MongoDB (default `mongodb://127.0.0.1:27017/web-daily`)
and `PORT` for HTTP (default `3000`) in the process environment. Set
`NODE_ENV=production` when deploying; production session cookies require HTTPS.
The application does not automatically load `.env` files.

`utils/logger.js` uses built-in Node modules to write one JSON record per line
to the console and `logs/YYYY-MM-DD.log` (UTC dates). Each entry has a timestamp,
level and fixed event message, with optional operational metadata. It records
startup, database connections/failures, request errors, login outcomes, logout
and authentication/authorization failures. The runtime `logs/` folder, local
environment files and `node_modules/` are ignored by Git.

Use only fixed messages and safe metadata (`method`, route templates, `status`,
`userId`, `role`, `reason`, `port`, and an `Error`). Do not pass bodies, cookies,
headers, query strings, passwords, session tokens or environment values. Error
messages and nested causes are omitted because they may contain secrets;
development logs include stack locations, while production logs keep only
the error name/code. Writes are synchronous for this small application; if
file logging fails, the logger reports it to the console and requests continue.
The process needs write access to `logs/`; archive or remove old daily files
as part of deployment maintenance.

## Project structure

- `config/` - configuration and database connection
- `controllers/` - request handlers
- `models/` - Mongoose models
- `routes/` - Express routes
- `views/` - EJS views
- `public/` - client-side CSS, JavaScript and images
- `middleware/` - authentication, authorization and validation middleware
- `services/` - application services and external integrations
- `utils/` - shared utilities
- `scripts/` - seed/demo scripts

## Publication and workflow contract

Article content is plain text. Reporters edit only workingVersion. Only the
future editor approval operation may replace publishedVersion and set publishedAt.

Public visibility depends on an approved snapshot existing, not workflow status:

    { publishedVersion: { $exists: true, $ne: null } }

Student 5's feed queries must use this rule too. Editing an approved article
moves its workflow from published to draft; draft, pending, and returned articles
can still have a public approved snapshot. Never render workingVersion publicly.

The public endpoint is GET /articles/:id. It selects only the approved snapshot,
reporter username, and publication date. Comments are an empty array until the
comments backend is implemented.

Reporter autosave and submission use conditional updates with ownership, current
status, and the Mongoose __v revision. Both increment __v. Future editor writes
must also check the expected status/revision and increment __v so that stale
reporter requests cannot overwrite a newer workflow decision.
