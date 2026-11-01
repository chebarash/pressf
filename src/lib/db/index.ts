import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { pressfDb?: Db };

export function db(): Db {
  globalForDb.pressfDb ??= drizzle(new Pool({ connectionString: env().DATABASE_URL, max: 10 }), { schema });
  return globalForDb.pressfDb;
}
