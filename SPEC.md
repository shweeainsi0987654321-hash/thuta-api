# API feature specification

This file describes API behavior that may evolve with product features. Stable technology choices and repository constraints are in `AGENTS.md`; local setup is in `README.md`.

## Base URL and errors

All routes are under `/api/v1`. Errors have the shape `{ "error": { "code": "...", "message": "...", "fields": {} } }`; `fields` is included when applicable. Use suitable HTTP status codes for validation, authentication, authorization, missing resources, and conflicts.

## Authentication

- `POST /auth/register` creates an owner account and session.
- `POST /auth/login` creates a session for valid credentials.
- `POST /auth/logout` revokes the current session.
- `GET /auth/me` returns the current user or an unauthenticated error.

## Public listings

- `GET /listings` returns published listings with photos and pagination metadata. Supported filters are `keyword`, `transactionType`, `city`, `propertyType`, `minPrice`, `maxPrice`, `minBedrooms`, and `minBathrooms`; sorting supports newest, `price_asc`, and `price_desc`. Pagination uses `page` and `pageSize`.
- `GET /listings/:id` returns a published listing and its photos, or `404`.

## Owner listings and photos

- `GET /me/listings` lists the authenticated owner's non-deleted listings.
- `POST /me/listings` creates a draft; `GET /me/listings/:id` reads it; `PATCH /me/listings/:id` updates supplied fields.
- `POST /me/listings/:id/publish` publishes when at least one photo exists; `POST /me/listings/:id/pause` pauses; `DELETE /me/listings/:id` marks it deleted.
- `POST /me/listings/:id/photos` uploads an image. `PATCH /me/listings/:id/photos/:photoId` changes alt text or display order. `DELETE /me/listings/:id/photos/:photoId` removes the photo.
- Every owner operation is limited to listings owned by the authenticated user.

## Administrator review

- `GET /admin/stats` returns listing counts by status and owner count.
- `GET /admin/listings` returns non-deleted listings; optional `status` and `search` query parameters filter the results.
- `PATCH /admin/listings/:id/status` sets status to `draft`, `published`, `paused`, or `deleted`.
- These routes require an administrator account.

## Listing and media rules

Listings support `buy`, `sell`, or `rent` transaction types; cities are Yangon, Mandalay, and Bago. A listing includes title, description, price and currency, address, property type, bedroom and bathroom counts, area and unit, and contact preference. Images may be JPEG, PNG, WebP, or SVG up to 8 MiB. Photo order and alt text are returned with listing data.

## Local seed data

The seed command should be repeatable and provide examples across supported cities and transaction types. Seed users exist for local development only.
