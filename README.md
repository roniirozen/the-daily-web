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
