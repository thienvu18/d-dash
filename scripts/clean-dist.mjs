import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

function removeDistDirs(rootDir) {
  const entries = readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "dist") {
        rmSync(fullPath, { recursive: true, force: true });
        continue;
      }

      removeDistDirs(fullPath);
    }
  }
}

for (const dir of ["packages", "examples"]) {
  try {
    const path = join(process.cwd(), dir);
    if (statSync(path).isDirectory()) {
      removeDistDirs(path);
    }
  } catch {
    // Ignore missing directories.
  }
}
