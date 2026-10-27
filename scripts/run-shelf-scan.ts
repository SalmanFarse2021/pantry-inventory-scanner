// Process a shelf scan by hand, the same way /api/shelf does (spends Gemini quota).
// For a scan left 'queued' because the API call never reached the server, or one in 'red' /
// 'waiting_quota'. A scan already 'processing', 'ready', 'confirmed' or 'rejected' is left alone.
//
//   npm run shelf-scan <scan-id>

import fs from "node:fs";

if (fs.existsSync(".env")) process.loadEnvFile(".env");
const { claimShelfScan, runShelfScan } = await import("../api/_lib/runShelf");

const scanId = process.argv[2];
if (!scanId) {
  console.error("usage: npm run shelf-scan <scan-id>");
  process.exit(1);
}

const claimed = await claimShelfScan(scanId);
if (!claimed) {
  console.error(`scan ${scanId} not found, or not in queued / red / waiting_quota`);
  process.exit(1);
}
console.log(`scan ${scanId}: ${await runShelfScan(scanId, claimed)}`);
