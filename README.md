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

This repository currently contains the shared MVC foundation only. Feature development is intentionally split into separate Git branches and Pull Requests.

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
