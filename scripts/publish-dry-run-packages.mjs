import { spawnSync } from "node:child_process";

const result = spawnSync("node", ["scripts/publish-packages.mjs", "dry-run"], {
  stdio: "inherit",
});

process.exit(result.status ?? 1);
