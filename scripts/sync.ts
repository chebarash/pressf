/** Same job as the nightly cron, for running by hand. */
import "dotenv/config";

async function main() {
  const { syncCatalog } = await import("../src/lib/catalog/sync");
  console.log(await syncCatalog());
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
