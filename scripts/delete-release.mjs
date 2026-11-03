import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TAURI_CONF = join(ROOT, "apps/desktop/src-tauri/tauri.conf.json");
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\w.-]+)?$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(cmd, args, { capture = false } = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function must(cmd, args) {
  const result = run(cmd, args);
  if (result.error?.code === "ENOENT") {
    fail(`${cmd} is not installed`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function captured(cmd, args) {
  const result = run(cmd, args, { capture: true });
  if (result.error?.code === "ENOENT") {
    fail(`${cmd} is not installed`);
  }
  return result;
}

function versionFromConf() {
  const conf = JSON.parse(readFileSync(TAURI_CONF, "utf8"));
  const version = typeof conf.version === "string" ? conf.version.trim() : "";
  if (!SEMVER.test(version)) {
    fail("No version in apps/desktop/src-tauri/tauri.conf.json");
  }
  return version;
}

function parseVersion(raw) {
  const trimmed = raw.trim();
  const version = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  if (!SEMVER.test(version)) {
    fail(`Invalid version: ${raw}\nUsage: npm run release:delete -- 0.1.4`);
  }
  return version;
}

const version = process.argv[2] ? parseVersion(process.argv[2]) : versionFromConf();
const tag = `v${version}`;
let removed = 0;

const release = captured("gh", ["release", "view", tag, "--json", "tagName"]);
if (release.status === 0) {
  console.log(`Deleting GitHub release ${tag}`);
  must("gh", ["release", "delete", tag, "--yes"]);
  removed += 1;
} else {
  const stderr = release.stderr ?? "";
  if (!/not found/i.test(stderr)) {
    if (stderr) process.stderr.write(stderr);
    fail(`Could not check GitHub release ${tag}`);
  }
}

const remote = captured("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]);
if (remote.status !== 0) {
  if (remote.stderr) process.stderr.write(remote.stderr);
  process.exit(remote.status ?? 1);
}
if (remote.stdout.trim()) {
  console.log(`Deleting remote tag ${tag}`);
  must("git", ["push", "origin", `:refs/tags/${tag}`]);
  removed += 1;
}

const local = captured("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
if (local.status === 0) {
  console.log(`Deleting local tag ${tag}`);
  must("git", ["tag", "-d", tag]);
  removed += 1;
}

if (removed === 0) {
  fail(`Nothing to delete for ${tag}`);
}

console.log(`Removed ${tag}. Run npm run release to publish it again.`);
