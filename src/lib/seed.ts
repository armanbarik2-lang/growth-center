import fs from "fs";
import path from "path";
import { pool } from "./db";

const ORDER = [
  "datasets", "members", "campaigns", "companies", "qualification_history", "contacts", "activities",
  "deals", "deal_history", "payments", "deliverables", "tasks", "targets", "activations", "notes", "sequences", "enrollments", "outreach_steps",
];
const JSON_COLS = new Set(["stages", "stage_prob", "pact", "rule", "to_heads", "steps"]);

type Row = Record<string, unknown>;

async function insertRows(client: import("pg").PoolClient, table: string, rows: Row[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const per = Math.max(1, Math.floor(30000 / cols.length));
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = chunk.map((r) => {
      const ph = cols.map((c) => {
        const v = r[c];
        params.push(JSON_COLS.has(c) && v !== null && v !== undefined ? JSON.stringify(v) : v ?? null);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await client.query(`insert into ${table} (${cols.join(",")}) values ${values.join(",")}`, params);
  }
}

/** Drops and recreates all tables, then loads both datasets. */
export async function runSetup(): Promise<Record<string, number>> {
  const root = process.cwd();
  const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
  const files = ["campusfest.json", "gef.json"].map((f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8")));
  const client = await pool().connect();
  const counts: Record<string, number> = {};
  try {
    await client.query("begin");
    await client.query(schema);
    for (const t of ORDER) {
      for (const f of files) {
        const rows: Row[] = f[t] || [];
        await insertRows(client, t, rows);
        counts[t] = (counts[t] || 0) + rows.length;
      }
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  return counts;
}

export async function isSetUp(): Promise<boolean> {
  try {
    const r = await pool().query("select count(*)::int as n from datasets");
    return r.rows[0].n > 0;
  } catch {
    return false;
  }
}
