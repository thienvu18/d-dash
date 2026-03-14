import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function getPackageDirs() {
  const packagesRoot = join(process.cwd(), "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name));
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function collectExportTargets(exportsField) {
  const targets = [];
  if (!exportsField || typeof exportsField !== "object") {
    return targets;
  }

  for (const value of Object.values(exportsField)) {
    if (typeof value === "string") {
      targets.push(value);
      continue;
    }

    if (value && typeof value === "object") {
      for (const nested of Object.values(value)) {
        if (typeof nested === "string") {
          targets.push(nested);
        }
      }
    }
  }

  return targets;
}

const missing = [];

for (const pkgDir of getPackageDirs()) {
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) {
    continue;
  }

  const pkg = readJson(pkgJsonPath);
  const targets = new Set([
    ...(typeof pkg.main === "string" ? [pkg.main] : []),
    ...(typeof pkg.types === "string" ? [pkg.types] : []),
    ...collectExportTargets(pkg.exports),
  ]);

  for (const relPath of targets) {
    const fullPath = join(pkgDir, relPath);
    if (!existsSync(fullPath)) {
      missing.push(`${pkg.name}: missing ${relPath}`);
    }
  }
}

if (missing.length > 0) {
  console.error(
    "Export verification failed:\n" + missing.map((x) => `- ${x}`).join("\n"),
  );
  process.exit(1);
}

console.log("Export verification passed.");
