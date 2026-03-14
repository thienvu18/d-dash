import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function listPublishablePackages() {
  const packagesRoot = join(process.cwd(), "packages");
  const packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name));

  const packages = [];
  for (const dir of packageDirs) {
    try {
      const pkg = readJson(join(dir, "package.json"));
      if (pkg.private === true) {
        continue;
      }

      packages.push({
        dir,
        name: pkg.name,
      });
    } catch {
      // Ignore folders without package.json.
    }
  }

  // Publish core first, then remaining packages in lexical order.
  return packages.sort((a, b) => {
    if (a.name === "@d-dash/core") {
      return -1;
    }
    if (b.name === "@d-dash/core") {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

const mode = process.argv[2] ?? "dry-run";
const isDryRun = mode !== "publish";
const args = isDryRun
  ? ["publish", "--access", "public", "--dry-run"]
  : ["publish", "--access", "public"];

const failed = [];
for (const pkg of listPublishablePackages()) {
  console.log(`\n==> ${isDryRun ? "Dry-run publish" : "Publish"}: ${pkg.name}`);
  const result = spawnSync("npm", args, {
    cwd: pkg.dir,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    failed.push(pkg.name);
  }
}

if (failed.length > 0) {
  console.error(`\nPackage ${isDryRun ? "dry-run publish" : "publish"} failed:\n${failed.map((name) => `- ${name}`).join("\n")}`);
  process.exit(1);
}

console.log(`\nPackage ${isDryRun ? "dry-run publish" : "publish"} passed.`);