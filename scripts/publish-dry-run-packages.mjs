import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const packagesRoot = join(process.cwd(), "packages");
const packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesRoot, entry.name));

const failed = [];

for (const dir of packageDirs) {
  let pkg;
  try {
    pkg = readJson(join(dir, "package.json"));
  } catch {
    continue;
  }

  if (pkg.private === true) {
    continue;
  }

  const result = spawnSync("npm", ["pack", "--dry-run"], {
    cwd: dir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    failed.push(pkg.name ?? dir);
  }
}

if (failed.length > 0) {
  console.error("Package dry-run publish failed:\n" + failed.map((name) => `- ${name}`).join("\n"));
  process.exit(1);
}

console.log("Package dry-run publish passed.");
