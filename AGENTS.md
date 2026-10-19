# API project guidance

## Repository boundary

This repository owns the versioned HTTP API, authentication and authorization, marketplace persistence, and listing photo handling. It serves the web app and the planned mobile client through `/api/v1`. Keep client presentation and client-specific navigation in their respective repositories. Do not make the API depend on either client repository at build or runtime.

## Stable architecture

- Use TypeScript on Node.js with Express.
- Use SQLite through `better-sqlite3` as the initial database. Schema setup and upgrades live with the API; preserve data when evolving the schema.
- Validate listing and photo input with Zod and return the established JSON error shape.
- Use HTTP-only session cookies. Store password hashes and session token hashes, never raw credentials or session tokens.
- Enforce role checks and listing ownership in API handlers. Public listing reads expose published listings only.
- Keep photo metadata in SQLite and uploaded files behind the API's upload directory configuration. Do not expose filesystem paths as client contracts.
- Keep all public routes under `/api/v1`; preserve the API DTO and error contract used by both clients.

## Constraints

- Never commit `.env`, local SQLite databases, or user uploads.
- Treat seed credentials as local-only and never use them in production.
- Configure the allowed web origin, database path, upload directory, cookie security, session secret, and port through environment variables. Replace development secrets before deployment.
- Do not add a cross-repository runtime dependency. If a shared API contract package becomes necessary, propose a separately versioned boundary.
- Keep changes within the API repository unless the task explicitly includes another project.

For current endpoints, behavior, and setup commands, see `SPEC.md` and `README.md`.
