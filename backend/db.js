import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

import { HttpError } from "./http.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "schema.sql");

let sqlClient = null;
let schemaPromise = null;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new HttpError(500, "DATABASE_URL não configurada.", {
      code: "missing_database_url",
    });
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }

  return sqlClient;
}

export async function dbQuery(text, params = []) {
  await ensureSchema();
  return getSql().query(text, params);
}

export async function dbTransaction(buildQueries) {
  await ensureSchema();
  return getSql().transaction((sql) => buildQueries(sql));
}

export async function ensureSchema() {
  if (schemaPromise) {
    return schemaPromise;
  }

  schemaPromise = applySchema().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function applySchema() {
  const source = await readFile(schemaPath, "utf8");
  const statements = source
    .split(/;\s*\n/g)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await getSql().query(statement);
  }
}
