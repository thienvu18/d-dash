import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const packageDirs = readdirSync(join(process.cwd(), "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(process.cwd(), "packages", entry.name));

const versions = new Map();

for (const dir of packageDirs) {
  try {
    const pkg = readJson(join(dir, "package.json"));
    if (pkg.name && pkg.version) {
      versions.set(pkg.name, pkg.version);
    }
  } catch {
    // Skip non-package folders.
  }
}

const uniqueVersions = new Set(versions.values());
if (uniqueVersions.size > 1) {
  console.error("Package version mismatch detected:");
  for (const [name, version] of versions) {
    console.error(`- ${name}: ${version}`);
  }
  process.exit(1);
}

console.log(`Version consistency passed (${Array.from(uniqueVersions)[0] ?? "n/a"}).`);
