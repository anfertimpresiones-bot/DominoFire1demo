import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "./schema.ts";

const { Pool } = pkg;

export const isSqlConfigured = !!(
  process.env.SQL_HOST &&
  process.env.SQL_USER &&
  process.env.SQL_PASSWORD &&
  process.env.SQL_DB_NAME
);

// Fallback pool if not fully configured yet
export const createPool = () => {
  if (!isSqlConfigured) {
    console.warn("SQL environment variables are not fully configured. Database connections will fail or fallback.");
  }
  return new Pool({
    host: process.env.SQL_HOST || "localhost",
    user: process.env.SQL_USER || "postgres",
    password: process.env.SQL_PASSWORD || "",
    database: process.env.SQL_DB_NAME || "postgres",
    connectionTimeoutMillis: 15000,
  });
};

const pool = createPool();

pool.on("error", (err) => {
  console.error("Unexpected error on idle SQL pool client:", err);
});

export const db = isSqlConfigured ? drizzle(pool, { schema }) : null;

if (isSqlConfigured) {
  console.log("Drizzle ORM Initialized with connection pool to Cloud SQL database:", process.env.SQL_DB_NAME);
} else {
  console.warn("Cloud SQL is not configured. Falling back to in-memory mode.");
}
