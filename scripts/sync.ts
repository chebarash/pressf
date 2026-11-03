/** Same job as the nightly cron, for running by hand. */
import "dotenv/config";

async function main() {
  const { nightlySync } = await import("../src/lib/mentions");
  console.log(await nightlySync());
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
