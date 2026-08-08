import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots = [resolve("web"), resolve("tests/frontend")];
const failures = [];

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

for (const path of roots.flatMap(filesBelow).filter((candidate) => extname(candidate) === ".js")) {
  const source = readFileSync(path, "utf8");
  const syntax = spawnSync(process.execPath, ["--check", path], { encoding: "utf8" });
  if (syntax.status !== 0) failures.push(`${path}: ${syntax.stderr.trim()}`);
  source.split(/\r?\n/).forEach((line, index) => {
    if (/\s+$/.test(line)) failures.push(`${path}:${index + 1}: trailing whitespace`);
  });
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const imported = resolve(dirname(path), match[1]);
    const candidates = [imported, `${imported}.js`, join(imported, "index.js")];
    if (!candidates.some(existsSync) && !match[1].includes("scripts/")) {
      failures.push(`${path}: missing local import ${match[1]}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Frontend syntax, whitespace, and local imports are clean.");
