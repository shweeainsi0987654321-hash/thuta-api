import fs from "node:fs";
import path from "node:path";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import multer from "multer";
import { z } from "zod";
import { config } from "./config.js";
import { db, ListingRow, withPhotos } from "./db.js";
import { errorFields, listingInput, photoInput } from "./validation.js";
import { hashPassword, hashToken, id, newToken, verifyPassword } from "./security.js";

type User = { id: string; email: string; name: string; role: "owner" | "admin" };
declare global { namespace Express { interface Request { user?: User } } }

const app = express();
fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  dest: config.uploadDir,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.mimetype))
});

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(config.uploadDir));

const now = () => new Date().toISOString();
const publicListing = (row: ListingRow) => withPhotos({
  id: row.id, transactionType: row.transaction_type, title: row.title, description: row.description,
  price: row.price, currency: row.currency, city: row.city, address: row.address,
  propertyType: row.property_type, bedrooms: row.bedrooms, bathrooms: row.bathrooms,
  area: row.area, areaUnit: row.area_unit, contactPreference: row.contact_preference,
  status: row.status, publishedAt: row.published_at, createdAt: row.created_at, updatedAt: row.updated_at
});
const ownerListing = (row: ListingRow) => ({ ...publicListing(row), ownerId: row.owner_id });
const adminListing = (row: ListingRow) => ({ ...ownerListing(row), owner: db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(row.owner_id) });

function sendError(res: Response, status: number, code: string, message: string, fields?: Record<string, string>) {
  return res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
}

function sessionUser(req: Request) {
  const token = req.cookies?.property_session;
  if (!token) return undefined;
  const row = db.prepare(`SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`).get(hashToken(token), now()) as User | undefined;
  return row;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) return sendError(res, 401, "UNAUTHENTICATED", "You must be logged in to do that.");
  req.user = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) return sendError(res, 401, "UNAUTHENTICATED", "You must be logged in to do that.");
  if (user.role !== "admin") return sendError(res, 403, "FORBIDDEN", "Admin access is required for this action.");
  req.user = user;
  next();
}

function setSession(res: Response, userId: string) {
  const token = newToken();
  const createdAt = new Date();
  const expires = new Date(createdAt.getTime() + config.sessionDays * 86400000);
  db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(id(), userId, hashToken(token), expires.toISOString(), createdAt.toISOString());
  res.cookie("property_session", token, { httpOnly: true, sameSite: "lax", secure: config.cookieSecure, expires, path: "/" });
}

function insertListing(userId: string, input: z.infer<typeof listingInput>, status = "draft") {
  const timestamp = now();
  const listingId = id();
  db.prepare(`INSERT INTO listings (id, owner_id, transaction_type, title, description, price, currency, city, address, property_type, bedrooms, bathrooms, area, area_unit, contact_preference, status, created_at, updated_at) VALUES (@id, @ownerId, @transactionType, @title, @description, @price, @currency, @city, @address, @propertyType, @bedrooms, @bathrooms, @area, @areaUnit, @contactPreference, @status, @createdAt, @updatedAt)`).run({ id: listingId, ownerId: userId, ...input, status, createdAt: timestamp, updatedAt: timestamp });
  return listingId;
}

const api = express.Router();

api.post("/auth/register", (req, res) => {
  const parsed = req.body as { email?: string; password?: string; name?: string };
  const email = parsed.email?.trim().toLowerCase();
  if (!email || !email.includes("@") || !parsed.password || parsed.password.length < 8 || !parsed.name?.trim()) return sendError(res, 400, "VALIDATION_ERROR", "The request contains invalid fields.", { email: "Enter a valid email.", password: "Password must be at least 8 characters.", name: "Name is required." });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return sendError(res, 409, "EMAIL_IN_USE", "An account with that email already exists.");
  const userId = id(); const timestamp = now();
  db.prepare("INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(userId, email, hashPassword(parsed.password), parsed.name.trim(), timestamp, timestamp);
  setSession(res, userId);
  res.status(201).json({ user: { id: userId, email, name: parsed.name.trim(), role: "owner" } });
});

api.post("/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase(); const password = String(req.body?.password ?? "");
  const user = db.prepare("SELECT id, email, name, role, password_hash FROM users WHERE email = ?").get(email) as (User & { password_hash: string }) | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) return sendError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  setSession(res, user.id); res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

api.post("/auth/logout", (req, res) => { const token = req.cookies?.property_session; if (token) db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").run(now(), hashToken(token)); res.clearCookie("property_session"); res.status(204).send(); });
api.get("/auth/me", (req, res) => { const user = sessionUser(req); if (!user) return sendError(res, 401, "UNAUTHENTICATED", "You are not logged in."); res.json({ user }); });

api.get("/listings", (req, res) => {
  const q = req.query; const where = ["l.status = 'published'"]; const params: Record<string, unknown> = {};
  if (q.keyword) { where.push("(l.title LIKE @keyword OR l.description LIKE @keyword OR l.address LIKE @keyword)"); params.keyword = `%${q.keyword}%`; }
  if (q.transactionType) { where.push("l.transaction_type = @transactionType"); params.transactionType = q.transactionType; }
  if (q.city) { where.push("l.city = @city"); params.city = q.city; }
  if (q.propertyType) { where.push("l.property_type = @propertyType"); params.propertyType = q.propertyType; }
  if (q.minPrice) { where.push("l.price >= @minPrice"); params.minPrice = Number(q.minPrice); }
  if (q.maxPrice) { where.push("l.price <= @maxPrice"); params.maxPrice = Number(q.maxPrice); }
  if (q.minBedrooms) { where.push("l.bedrooms >= @minBedrooms"); params.minBedrooms = Number(q.minBedrooms); }
  if (q.minBathrooms) { where.push("l.bathrooms >= @minBathrooms"); params.minBathrooms = Number(q.minBathrooms); }
  const page = Math.max(Number(q.page ?? 1), 1); const pageSize = Math.min(Math.max(Number(q.pageSize ?? 12), 1), 50); params.limit = pageSize; params.offset = (page - 1) * pageSize;
  const sort = q.sort === "price_asc" ? "l.price ASC" : q.sort === "price_desc" ? "l.price DESC" : "l.published_at DESC";
  const base = `FROM listings l WHERE ${where.join(" AND ")}`;
  const total = (db.prepare(`SELECT COUNT(*) AS count ${base}`).get(params) as { count: number }).count;
  const rows = db.prepare(`SELECT l.* ${base} ORDER BY ${sort} LIMIT @limit OFFSET @offset`).all(params) as ListingRow[];
  res.json({ data: rows.map(publicListing), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

api.get("/listings/:id", (req, res) => { const row = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'published'").get(req.params.id) as ListingRow | undefined; if (!row) return sendError(res, 404, "NOT_FOUND", "Listing not found."); res.json({ data: publicListing(row) }); });

api.get("/me/listings", requireAuth, (req, res) => { const rows = db.prepare("SELECT * FROM listings WHERE owner_id = ? AND status != 'deleted' ORDER BY updated_at DESC").all(req.user!.id) as ListingRow[]; res.json({ data: rows.map(ownerListing) }); });
api.post("/me/listings", requireAuth, (req, res) => { const parsed = listingInput.safeParse(req.body); if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "The request contains invalid fields.", errorFields(parsed.error)); const listingId = insertListing(req.user!.id, parsed.data); const row = db.prepare("SELECT * FROM listings WHERE id = ?").get(listingId) as ListingRow; res.status(201).json({ data: ownerListing(row) }); });

function ownedListing(req: Request, res: Response) { const row = db.prepare("SELECT * FROM listings WHERE id = ? AND owner_id = ? AND status != 'deleted'").get(req.params.id, req.user!.id) as ListingRow | undefined; if (!row) { sendError(res, 404, "NOT_FOUND", "Listing not found."); return undefined; } return row; }
api.get("/me/listings/:id", requireAuth, (req, res) => { const row = ownedListing(req, res); if (row) res.json({ data: ownerListing(row) }); });
api.patch("/me/listings/:id", requireAuth, (req, res) => { const row = ownedListing(req, res); if (!row) return; const parsed = listingInput.partial().safeParse(req.body); if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "The request contains invalid fields.", errorFields(parsed.error)); const fieldMap: Record<string, string> = { transactionType: "transaction_type", propertyType: "property_type", areaUnit: "area_unit", contactPreference: "contact_preference" }; const updates = Object.entries(parsed.data).map(([key]) => `${fieldMap[key] ?? key} = @${key}`); if (!updates.length) return res.json({ data: ownerListing(row) }); const params = { ...parsed.data, id: req.params.id, updatedAt: now() }; updates.push("updated_at = @updatedAt"); db.prepare(`UPDATE listings SET ${updates.join(", ")} WHERE id = @id AND owner_id = @ownerId`).run({ ...params, ownerId: req.user!.id }); const updated = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id) as ListingRow; res.json({ data: ownerListing(updated) }); });
api.post("/me/listings/:id/publish", requireAuth, (req, res) => { const row = ownedListing(req, res); if (!row) return; const photoCount = (db.prepare("SELECT COUNT(*) AS count FROM listing_photos WHERE listing_id = ?").get(row.id) as { count: number }).count; if (photoCount < 1) return sendError(res, 409, "PHOTO_REQUIRED", "Add at least one photo before publishing."); db.prepare("UPDATE listings SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ? AND owner_id = ?").run(now(), now(), row.id, req.user!.id); res.json({ data: ownerListing(db.prepare("SELECT * FROM listings WHERE id = ?").get(row.id) as ListingRow) }); });
api.post("/me/listings/:id/pause", requireAuth, (req, res) => { const row = ownedListing(req, res); if (!row) return; db.prepare("UPDATE listings SET status = 'paused', updated_at = ? WHERE id = ? AND owner_id = ?").run(now(), row.id, req.user!.id); res.json({ data: ownerListing(db.prepare("SELECT * FROM listings WHERE id = ?").get(row.id) as ListingRow) }); });
api.delete("/me/listings/:id", requireAuth, (req, res) => { const row = ownedListing(req, res); if (!row) return; db.prepare("UPDATE listings SET status = 'deleted', updated_at = ? WHERE id = ? AND owner_id = ?").run(now(), row.id, req.user!.id); res.status(204).send(); });

api.get("/admin/stats", requireAdmin, (_req, res) => {
  const counts = db.prepare("SELECT status, COUNT(*) AS count FROM listings GROUP BY status").all() as Array<{ status: string; count: number }>;
  const byStatus = Object.fromEntries(counts.map((item) => [item.status, item.count]));
  const owners = (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'owner'").get() as { count: number }).count;
  res.json({ data: { listings: { total: Object.values(byStatus).reduce((sum, value) => sum + value, 0), ...byStatus }, owners } });
});

api.get("/admin/listings", requireAdmin, (req, res) => {
  const status = String(req.query.status ?? "");
  const search = String(req.query.search ?? "").trim();
  const where = ["l.status != 'deleted'"]; const params: Record<string, string> = {};
  if (["draft", "published", "paused"].includes(status)) { where.push("l.status = @status"); params.status = status; }
  if (search) { where.push("(l.title LIKE @search OR l.city LIKE @search OR u.email LIKE @search OR u.name LIKE @search)"); params.search = `%${search}%`; }
  const rows = db.prepare(`SELECT l.* FROM listings l JOIN users u ON u.id = l.owner_id WHERE ${where.join(" AND ")} ORDER BY l.updated_at DESC`).all(params) as ListingRow[];
  res.json({ data: rows.map(adminListing) });
});

api.patch("/admin/listings/:id/status", requireAdmin, (req, res) => {
  const parsed = z.object({ status: z.enum(["draft", "published", "paused", "deleted"]) }).safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "Choose a valid listing status.", { status: "Status must be draft, published, paused, or deleted." });
  const row = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id) as ListingRow | undefined;
  if (!row) return sendError(res, 404, "NOT_FOUND", "Listing not found.");
  const publishedAt = parsed.data.status === "published" ? now() : row.published_at;
  db.prepare("UPDATE listings SET status = ?, published_at = ?, updated_at = ? WHERE id = ?").run(parsed.data.status, publishedAt, now(), row.id);
  res.json({ data: adminListing(db.prepare("SELECT * FROM listings WHERE id = ?").get(row.id) as ListingRow) });
});

api.post("/me/listings/:id/photos", requireAuth, upload.single("photo"), (req, res) => { const row = ownedListing(req, res); if (!row) return; if (!req.file) return sendError(res, 400, "VALIDATION_ERROR", "An image file is required.", { photo: "Upload a JPG, PNG, WebP, or SVG image." }); const parsed = photoInput.safeParse(req.body); if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "Invalid photo metadata.", errorFields(parsed.error)); const photoId = id(); const url = `/uploads/${path.basename(req.file.path)}`; db.prepare("INSERT INTO listing_photos (id, listing_id, storage_key, url, alt_text, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(photoId, row.id, path.basename(req.file.path), url, parsed.data.altText ?? row.title, parsed.data.sortOrder ?? 0, now()); res.status(201).json({ data: { id: photoId, url, altText: parsed.data.altText ?? row.title, sortOrder: parsed.data.sortOrder ?? 0 } }); });
api.patch("/me/listings/:id/photos/:photoId", requireAuth, (req, res) => { const row = ownedListing(req, res); if (!row) return; const parsed = photoInput.safeParse(req.body); if (!parsed.success) return sendError(res, 400, "VALIDATION_ERROR", "Invalid photo metadata.", errorFields(parsed.error)); const result = db.prepare("UPDATE listing_photos SET alt_text = COALESCE(@altText, alt_text), sort_order = COALESCE(@sortOrder, sort_order) WHERE id = @photoId AND listing_id = @listingId").run({ ...parsed.data, photoId: req.params.photoId, listingId: row.id }); if (!result.changes) return sendError(res, 404, "NOT_FOUND", "Photo not found."); res.status(204).send(); });
api.delete("/me/listings/:id/photos/:photoId", requireAuth, (req, res) => { const row = ownedListing(req, res); if (!row) return; const photo = db.prepare("SELECT storage_key FROM listing_photos WHERE id = ? AND listing_id = ?").get(req.params.photoId, row.id) as { storage_key: string } | undefined; if (!photo) return sendError(res, 404, "NOT_FOUND", "Photo not found."); db.prepare("DELETE FROM listing_photos WHERE id = ? AND listing_id = ?").run(req.params.photoId, row.id); const file = path.join(config.uploadDir, photo.storage_key); if (fs.existsSync(file)) fs.unlinkSync(file); res.status(204).send(); });

app.use("/api/v1", api);
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(err); sendError(res, 500, "INTERNAL_ERROR", "Something went wrong."); });

app.listen(config.port, "0.0.0.0", () => console.log(`Property Portal API listening on http://localhost:${config.port}`));
