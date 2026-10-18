import "dotenv/config";
import path from "node:path";

const root = process.cwd();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databasePath: path.resolve(root, process.env.DATABASE_PATH ?? "./data/property-portal.sqlite"),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR ?? "./uploads"),
  sessionSecret: process.env.SESSION_SECRET ?? "local-development-secret-change-me",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  sessionDays: 30
};
