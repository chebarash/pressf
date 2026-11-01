import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Creates the test database if needed and brings it to the latest schema. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://pressf@127.0.0.1:5544/pressf_test");
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const root = new Pool({ connectionString: admin.toString() });
  const { rowCount } = await root.query("select 1 from pg_database where datname = $1", [name]);
  if (!rowCount) await root.query(`create database "${name}"`);
  await root.end();
  const pool = new Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
