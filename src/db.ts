import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

export const db = new Database(config.databasePath);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );
  CREATE TABLE IF NOT EXISTS listings (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('buy', 'sell', 'rent')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT NOT NULL,
    city TEXT NOT NULL CHECK (city IN ('Yangon', 'Mandalay', 'Bago')),
    address TEXT NOT NULL,
    property_type TEXT NOT NULL,
    bedrooms INTEGER NOT NULL,
    bathrooms INTEGER NOT NULL,
    area REAL NOT NULL,
    area_unit TEXT NOT NULL,
    contact_preference TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'paused', 'deleted')),
    published_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS listing_photos (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL,
    url TEXT NOT NULL,
    alt_text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS listings_status_idx ON listings(status);
  CREATE INDEX IF NOT EXISTS listings_city_idx ON listings(city);
  CREATE INDEX IF NOT EXISTS listings_transaction_idx ON listings(transaction_type);
  CREATE INDEX IF NOT EXISTS listings_property_idx ON listings(property_type);
  CREATE INDEX IF NOT EXISTS listings_price_idx ON listings(price);
  CREATE INDEX IF NOT EXISTS listings_published_idx ON listings(published_at);
  CREATE INDEX IF NOT EXISTS listings_owner_idx ON listings(owner_id);
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === "role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'");
}
db.exec("CREATE INDEX IF NOT EXISTS users_role_idx ON users(role)");

export type ListingRow = {
  id: string; owner_id: string; transaction_type: string; title: string; description: string;
  price: number; currency: string; city: string; address: string; property_type: string;
  bedrooms: number; bathrooms: number; area: number; area_unit: string;
  contact_preference: string; status: string; published_at: string | null;
  created_at: string; updated_at: string;
};

export function withPhotos<T extends Record<string, unknown>>(listing: T) {
  const photos = db.prepare("SELECT id, url, alt_text, sort_order FROM listing_photos WHERE listing_id = ? ORDER BY sort_order, created_at").all(listing.id) as Array<Record<string, unknown>>;
  return { ...listing, photos };
}
