import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.-]+)?$/;

const JSON_FILES = [
  "package.json",
  "apps/desktop/package.json",
  "packages/core/package.json",
  "apps/desktop/src-tauri/tauri.conf.json",
];

function usage(message) {
  if (message) {
    console.error(message);
  }
  console.error("Usage: npm run version:set -- 0.1.1");
  process.exit(1);
}

function parseVersion(raw) {
  const trimmed = raw.trim();
  const version = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  if (!SEMVER.test(version)) {
    usage(`Invalid version: ${raw}`);
  }
  return version;
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function bumpJson(relativePath, version) {
  const path = join(ROOT, relativePath);
  const data = JSON.parse(readFileSync(path, "utf8"));
  data.version = version;
  writeJson(path, data);
}

function bumpCargo(version) {
  const path = join(ROOT, "apps/desktop/src-tauri/Cargo.toml");
  const text = readFileSync(path, "utf8");
  const next = text.replace(
    /(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
    `$1${version}$3`,
  );
  if (next === text && !text.includes(`version = "${version}"`)) {
    usage(`Could not update version in ${path}`);
  }
  writeFileSync(path, next);
}

function bumpLockfile(version) {
  const path = join(ROOT, "package-lock.json");
  const lock = JSON.parse(readFileSync(path, "utf8"));
  lock.version = version;
  if (lock.packages?.[""]) {
    lock.packages[""].version = version;
  }
  if (lock.packages?.["apps/desktop"]) {
    lock.packages["apps/desktop"].version = version;
  }
  if (lock.packages?.["packages/core"]) {
    lock.packages["packages/core"].version = version;
  }
  writeJson(path, lock);
}

const raw = process.argv[2];
if (!raw) {
  usage();
}

const version = parseVersion(raw);
for (const file of JSON_FILES) {
  bumpJson(file, version);
}
bumpCargo(version);
bumpLockfile(version);
console.log(`Set version ${version} (tag v${version})`);
