import fs from "node:fs";
import path from "node:path";
import { db } from "./db.js";
import { config } from "./config.js";
import { hashPassword, id } from "./security.js";

const now = () => new Date().toISOString();
const ownerId = "seed-owner-001";
const demoUsers = [
  { id: ownerId, email: "owner@example.com", password: "password123", name: "Demo Owner", role: "owner" },
  { id: "seed-owner-002", email: "second-owner@example.com", password: "password123", name: "Second Demo Owner", role: "owner" },
  { id: "seed-admin-001", email: "admin@example.com", password: "admin12345", name: "Demo Admin", role: "admin" }
] as const;
for (const user of demoUsers) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(user.id);
  if (!existing) db.prepare("INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(user.id, user.email, hashPassword(user.password), user.name, user.role, now(), now());
  else db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(user.role, now(), user.id);
}

const cities = ["Yangon", "Mandalay", "Bago"] as const;
const transactions = ["buy", "sell", "rent"] as const;
const properties = ["Condo", "House", "Apartment"];
const colors = ["#0f766e", "#1d4ed8", "#b45309", "#7c3aed", "#be123c", "#166534"];
const realPhotoFiles = ["property-interior.png", "property-house.png", "property-bedroom.png", "property-kitchen.png"];

function fixturePhoto(listingId: string, title: string, city: string, property: string, file: string, color: string, sortOrder: number) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const realFile = realPhotoFiles[sortOrder % realPhotoFiles.length];
  const effectiveFile = fs.existsSync(path.join(config.uploadDir, realFile)) ? realFile : file;
  const filePath = path.join(config.uploadDir, effectiveFile);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/><circle cx="880" cy="220" r="170" fill="#ffffff" opacity=".13"/><path d="M0 620L330 350 600 570 810 410 1200 700V800H0Z" fill="#fff" opacity=".16"/><text x="60" y="120" fill="#fff" font-size="42" font-family="Arial">${city} · ${property}</text></svg>`;
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, svg);
  const photoExists = db.prepare("SELECT id FROM listing_photos WHERE listing_id = ? AND storage_key = ?").get(listingId, effectiveFile);
  if (!photoExists) db.prepare("INSERT INTO listing_photos (id, listing_id, storage_key, url, alt_text, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id(), listingId, effectiveFile, `/uploads/${effectiveFile}`, `${title} photo ${sortOrder + 1}`, sortOrder, now());
}

function ensureFixture(input: { key: string; city: typeof cities[number]; transaction: typeof transactions[number]; property: string; title: string; description: string; price: number; bedrooms: number; bathrooms: number; area: number; status: "draft" | "published" | "paused"; photoCount: number }) {
  const existingListing = db.prepare("SELECT id FROM listings WHERE title = ?").get(input.title) as { id: string } | undefined;
  const timestamp = now();
  const listingId = existingListing?.id ?? id();
  if (!existingListing) {
    db.prepare(`INSERT INTO listings (id, owner_id, transaction_type, title, description, price, currency, city, address, property_type, bedrooms, bathrooms, area, area_unit, contact_preference, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(listingId, ownerId, input.transaction, input.title, input.description, input.price, "MMK", input.city, `${input.city} neighborhood, Ward ${input.key}`, input.property, input.bedrooms, input.bathrooms, input.area, "sq ft", "both", input.status, input.status === "published" ? timestamp : null, timestamp, timestamp);
  }
  for (let photoIndex = 0; photoIndex < input.photoCount; photoIndex += 1) {
    fixturePhoto(listingId, input.title, input.city, input.property, `fixture-${input.key}-${photoIndex}.svg`, colors[(input.key.length + photoIndex) % colors.length], photoIndex);
  }
}

const count = (db.prepare("SELECT COUNT(*) AS count FROM listings WHERE owner_id = ?").get(ownerId) as { count: number }).count;
if (count === 0) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const add = db.transaction(() => {
    cities.forEach((city, cityIndex) => transactions.forEach((transaction, transactionIndex) => {
      const listingId = id(); const timestamp = now(); const title = `${properties[(cityIndex + transactionIndex) % properties.length]} ${transaction} opportunity in ${city}`;
      db.prepare(`INSERT INTO listings (id, owner_id, transaction_type, title, description, price, currency, city, address, property_type, bedrooms, bathrooms, area, area_unit, contact_preference, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(listingId, ownerId, transaction, title, `A bright and practical ${properties[(cityIndex + transactionIndex) % properties.length].toLowerCase()} with easy access to schools, markets, and transport. Suitable for families and long-term plans.`, 45000000 + cityIndex * 18000000 + transactionIndex * 12500000, "MMK", city, `${city} Main Road, Ward ${cityIndex + transactionIndex + 1}`, properties[(cityIndex + transactionIndex) % properties.length], 2 + transactionIndex, 1 + (cityIndex % 2), 850 + cityIndex * 240 + transactionIndex * 110, "sq ft", "both", "published", timestamp, timestamp, timestamp);
      [0, 1].forEach((photoIndex) => { const color = colors[(cityIndex * 2 + transactionIndex + photoIndex) % colors.length]; const file = `seed-${cityIndex}-${transactionIndex}-${photoIndex}.svg`; const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/><circle cx="880" cy="220" r="170" fill="#ffffff" opacity=".13"/><path d="M0 620L330 350 600 570 810 410 1200 700V800H0Z" fill="#fff" opacity=".16"/><text x="60" y="120" fill="#fff" font-size="42" font-family="Arial">${city} · ${properties[(cityIndex + transactionIndex) % properties.length]}</text></svg>`; fs.writeFileSync(path.join(config.uploadDir, file), svg); db.prepare("INSERT INTO listing_photos (id, listing_id, storage_key, url, alt_text, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id(), listingId, file, `/uploads/${file}`, `${title} photo ${photoIndex + 1}`, photoIndex, timestamp); });
    }));
  });
  add();
}

const additionalFixtures = db.transaction(() => {
  cities.forEach((city, cityIndex) => transactions.forEach((transaction, transactionIndex) => {
    const property = properties[(cityIndex + transactionIndex + 1) % properties.length];
    ensureFixture({
      key: `${cityIndex}-${transactionIndex}-extra`, city, transaction, property,
      title: `[Fixture] ${property} ${transaction} near ${city} market`,
      description: `A second ${property.toLowerCase()} fixture for testing search, sorting, and city filters in ${city}. Comfortable layout with convenient access to daily essentials and public transport.`,
      price: 62000000 + cityIndex * 15000000 + transactionIndex * 9500000,
      bedrooms: 1 + ((cityIndex + transactionIndex) % 4), bathrooms: 1 + (transactionIndex % 3),
      area: 720 + cityIndex * 180 + transactionIndex * 95, status: "published", photoCount: 2
    });
  }));
  ensureFixture({ key: "lifecycle-draft", city: "Yangon", transaction: "sell", property: "Townhouse", title: "[Fixture] Draft townhouse awaiting photos", description: "A draft listing fixture for testing owner editing, validation, and the publish workflow.", price: 128000000, bedrooms: 3, bathrooms: 2, area: 1800, status: "draft", photoCount: 1 });
  ensureFixture({ key: "lifecycle-paused", city: "Mandalay", transaction: "rent", property: "Studio", title: "[Fixture] Paused studio for dashboard testing", description: "A paused listing fixture for testing owner status actions and private dashboard visibility.", price: 850000, bedrooms: 1, bathrooms: 1, area: 520, status: "paused", photoCount: 1 });
});
additionalFixtures();

if (realPhotoFiles.every((file) => fs.existsSync(path.join(config.uploadDir, file)))) {
  const photos = db.prepare("SELECT id, listing_id FROM listing_photos ORDER BY created_at, id").all() as Array<{ id: string; listing_id: string }>;
  const listingTitles = new Map((db.prepare("SELECT id, title FROM listings").all() as Array<{ id: string; title: string }>).map((listing) => [listing.id, listing.title]));
  const updatePhoto = db.prepare("UPDATE listing_photos SET storage_key = ?, url = ?, alt_text = ? WHERE id = ?");
  photos.forEach((photo, index) => {
    const file = realPhotoFiles[index % realPhotoFiles.length];
    updatePhoto.run(file, `/uploads/${file}`, `${listingTitles.get(photo.listing_id) ?? "Property"} photo ${index + 1}`, photo.id);
  });
  console.log(`Real photo fixtures linked: ${photos.length}`);
} else {
  console.log("Real photo fixtures not found; keeping generated SVG fixtures.");
}

const seedListings = db.prepare("SELECT id FROM listings WHERE title LIKE '% opportunity in %' OR title LIKE '[Fixture] %'").all() as Array<{ id: string }>;
const deleteExtraPhotos = db.prepare("DELETE FROM listing_photos WHERE id = ?");
seedListings.forEach((listing) => {
  const photos = db.prepare("SELECT id FROM listing_photos WHERE listing_id = ? ORDER BY sort_order, created_at, id").all(listing.id) as Array<{ id: string }>;
  photos.slice(2).forEach((photo) => deleteExtraPhotos.run(photo.id));
});

const summary = db.prepare("SELECT COUNT(*) AS count FROM listings WHERE status = 'published'").get() as { count: number };
const photoSummary = db.prepare("SELECT COUNT(*) AS count FROM listing_photos").get() as { count: number };
console.log(`Seed complete: ${summary.count} published listings, ${photoSummary.count} photos. Demo login: owner@example.com / password123`);
