import "dotenv/config";
import { harvestAll } from "@/lib/lms/harvest";

/**
 * Harvest the LMS catalog and curricula into our tables, using the saved
 * student logins. Needs CREDENTIAL_KEY and DATABASE_URL, and at least one
 * seeded lms_accounts row (scripts/lms-seed.ts). Pass a smaller ceiling while
 * testing: LMS_HARVEST_MAX=200 npx tsx scripts/lms-harvest.ts
 */
async function main() {
  const maxId = Number(process.env.LMS_HARVEST_MAX) || undefined;
  const result = await harvestAll(maxId ? { maxId } : {});
  if ("error" in result) throw new Error(result.error);
  console.log("Harvested", result);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
