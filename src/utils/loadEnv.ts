import fs from "fs";
import path from "path";

// Minimal .env parser — reads KEY=VALUE lines from <cwd>/.env and sets any
// key that is not already in process.env (shell-set vars always win).
// Skips blank lines and # comments. Strips inline quotes and comments.
export function loadEnv(envPath?: string): void {
  const filePath = envPath ?? path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split("\n");

  for (const raw of lines) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const eqIndex = line.indexOf("=");
    if (eqIndex < 1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Strip surrounding quotes (single or double).
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Strip trailing inline comment (# preceded by whitespace).
    const commentMatch = value.match(/\s+#.*$/);
    if (commentMatch) {
      value = value.slice(0, commentMatch.index).trim();
    }

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}
