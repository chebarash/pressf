import "dotenv/config";
import { harvestCatalog } from "@/lib/lms/harvest";
import { harvestSession } from "@/lib/lms/store";

/**
 * Harvest the LMS catalog into our tables, using any saved student login.
 * Needs CREDENTIAL_KEY and DATABASE_URL, and at least one seeded lms_accounts
 * row (scripts/lms-seed.ts). Pass a smaller ceiling while testing:
 *   LMS_HARVEST_MAX=200 npx tsx scripts/lms-harvest.ts
 */
async function main() {
  const session = await harvestSession();
  if (!session) throw new Error("No active LMS account to harvest with (seed one first)");
  const maxId = Number(process.env.LMS_HARVEST_MAX) || undefined;
  const result = await harvestCatalog(session, maxId ? { maxId } : {});
  console.log("Harvested", result);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
