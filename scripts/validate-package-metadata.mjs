import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const requiredFields = ["name", "version", "description", "license", "type", "main", "types", "exports", "files", "keywords", "publishConfig", "engines"];

const packageDirs = readdirSync(join(process.cwd(), "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(process.cwd(), "packages", entry.name));

const failures = [];

for (const dir of packageDirs) {
  try {
    const pkg = readJson(join(dir, "package.json"));

    for (const field of requiredFields) {
      if (!(field in pkg)) {
        failures.push(`${pkg.name ?? dir}: missing ${field}`);
      }
    }

    if (pkg.private === true) {
      failures.push(`${pkg.name ?? dir}: private must be false/omitted for publishing`);
    }
  } catch {
    failures.push(`${dir}: package.json missing or invalid`);
  }
}

if (failures.length > 0) {
  console.error("Package metadata validation failed:\n" + failures.map((x) => `- ${x}`).join("\n"));
  process.exit(1);
}

console.log("Package metadata validation passed.");
