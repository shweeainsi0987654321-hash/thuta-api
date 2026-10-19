# Thadin API

TypeScript and Express API for the Thadin property marketplace. It provides authentication, public listing search, owner listing and photo management, and administrator review. Data is stored in SQLite and local uploads are served from the configured upload directory.

## Requirements

- Node.js and npm

## Local development

```powershell
npm install
Copy-Item .env.example .env
npm run seed
npm run dev
```

The API listens on `http://localhost:4000` by default. The web app expects `/api/v1` at that origin.

Seed accounts for local development:

- Owner: `owner@example.com` / `password123`
- Second owner: `second-owner@example.com` / `password123`
- Admin: `admin@example.com` / `admin12345`

Never use seed credentials outside local development.

## Configuration

`.env.example` documents `PORT`, `DATABASE_PATH`, `UPLOAD_DIR`, `SESSION_SECRET`, `WEB_ORIGIN`, and `COOKIE_SECURE`. Set a private session secret and enable secure cookies in HTTPS deployments.

## Commands

- `npm run dev` — run the API with file watching.
- `npm run migrate` — initialize or upgrade the local database schema.
- `npm run seed` — create repeatable local sample data.
- `npm run lint` — type-check the TypeScript project.
- `npm run build` — compile to `dist/`.
- `npm start` — run the compiled API.

See `SPEC.md` for endpoint behavior and `AGENTS.md` for stable architecture and repository constraints.
