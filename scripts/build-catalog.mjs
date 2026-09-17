import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATAMINE = process.env.WT_DATAMINE ?? join(ROOT, ".cache", "datamine");
const TANK_DIR = join(DATAMINE, "aces.vromfs.bin_u/gamedata/units/tankmodels");
const WEAPON_DIR = join(DATAMINE, "aces.vromfs.bin_u/gamedata/weapons/groundmodels_weapons");
const UNITS_CSV = join(DATAMINE, "lang.vromfs.bin_u/lang/units.csv");
const OUT = join(ROOT, "data/catalog.json");

const FOV_REF = 73.68;
const AMMO = ["AP", "HEAT", "APDS", "HE"];

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ";" && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function fovToZoom(fov) {
  if (!Number.isFinite(fov) || fov <= 0) {
    return null;
  }
  return Math.round((FOV_REF / fov) * 10) / 10;
}

const KNOWN_COUNTRIES = new Set(["us", "germ", "ussr", "uk", "jp", "it", "fr", "cn", "sw", "il"]);

function countryFromId(id) {
  const prefix = id.split("_")[0] || "other";
  return KNOWN_COUNTRIES.has(prefix) ? prefix : "other";
}

function mapBulletType(raw) {
  const s = raw.toLowerCase();
  if (s === "ap") {
    return null;
  }
  if (s.includes("apds")) {
    return "APDS";
  }
  if (s.includes("heat")) {
    return "HEAT";
  }
  if (
    s.includes("hesh") ||
    s.includes("he_frag") ||
    s.includes("he_or") ||
    s.includes("he_dp") ||
    s.includes("he_i") ||
    s.startsWith("he_")
  ) {
    return "HE";
  }
  if (
    s.includes("apcr") ||
    s.includes("apcbc") ||
    s.includes("aphe") ||
    s.includes("apbc") ||
    s.includes("apc_") ||
    s.includes("ap_tank") ||
    s.includes("ap_t")
  ) {
    return "AP";
  }
  return null;
}

function loadNames(csvText) {
  const names = new Map();
  for (const line of csvText.split(/\r?\n/)) {
    if (!line.startsWith('"') || !line.includes("_shop")) {
      continue;
    }
    const fields = parseCsvLine(line);
    const key = fields[0] ?? "";
    if (!key.endsWith("_shop")) {
      continue;
    }
    const id = key.slice(0, -"_shop".length);
    names.set(id, {
      nameEn: fields[1] || id,
      nameRu: fields[6] || fields[1] || id,
    });
  }
  return names;
}

function extractGunnerZoom(text) {
  const pairs = [];
  const re = /"zoomOutFov"\s*:\s*([0-9.]+)[\s\S]{0,500}?"zoomInFov"\s*:\s*([0-9.]+)/g;
  for (const match of text.matchAll(re)) {
    pairs.push({
      out: Number(match[1]),
      inn: Number(match[2]),
      at: match.index ?? 0,
    });
  }
  const scoped = pairs.filter((pair) => pair.out < 45 && pair.inn < 45 && pair.out > 0);
  const withSight = scoped.find((pair) =>
    /"sightName"/.test(text.slice(pair.at, pair.at + 900)),
  );
  const chosen = withSight ?? scoped[0] ?? pairs.find((pair) => pair.out < 45) ?? pairs[0];
  if (!chosen) {
    return null;
  }
  const zoomMin = fovToZoom(chosen.out);
  const zoomMax = fovToZoom(chosen.inn) ?? zoomMin;
  if (zoomMin == null || zoomMax == null) {
    return null;
  }
  return { zoomMin, zoomMax: Math.max(zoomMin, zoomMax) };
}

function weaponFileName(blkPath) {
  const normalized = blkPath.replaceAll("\\", "/").toLowerCase();
  const name = normalized.split("/").pop() ?? "";
  return name.endsWith(".blk") ? `${name}x` : name;
}

function isPrimaryWeapon(fileName) {
  if (!fileName.includes("cannon") && !fileName.includes("gun") && !fileName.includes("howitzer")) {
    return fileName.includes("mortar") || fileName.includes("recoilless");
  }
  if (
    fileName.includes("machinegun") ||
    fileName.includes("machine_gun") ||
    fileName.includes("smoke") ||
    fileName.includes("dummy") ||
    fileName.includes("aa_gun")
  ) {
    return false;
  }
  return true;
}

function sightsFromWeaponText(text) {
  const found = new Set();
  for (const match of text.matchAll(/"bulletType"\s*:\s*"([^"]+)"/g)) {
    const mapped = mapBulletType(match[1]);
    if (mapped) {
      found.add(mapped);
    }
  }
  return found;
}

const names = loadNames(readFileSync(UNITS_CSV, "utf8"));
const weaponCache = new Map();

function weaponSights(fileName) {
  if (weaponCache.has(fileName)) {
    return weaponCache.get(fileName);
  }
  const path = join(WEAPON_DIR, fileName);
  let found = new Set();
  try {
    found = sightsFromWeaponText(readFileSync(path, "utf8"));
  } catch {
    found = new Set();
  }
  weaponCache.set(fileName, found);
  return found;
}

const tanks = [];
for (const file of readdirSync(TANK_DIR)) {
  if (!file.endsWith(".blkx")) {
    continue;
  }
  const id = file.replace(/\.blkx$/i, "");
  const text = readFileSync(join(TANK_DIR, file), "utf8");
  const zoom = extractGunnerZoom(text);
  if (!zoom) {
    continue;
  }
  const { zoomMin, zoomMax } = zoom;

  const sights = new Set();
  for (const match of text.matchAll(/"blk"\s*:\s*"([^"]+)"/g)) {
    const fileName = weaponFileName(match[1]);
    if (!isPrimaryWeapon(fileName)) {
      continue;
    }
    for (const ammo of weaponSights(fileName)) {
      sights.add(ammo);
    }
  }

  const ordered = AMMO.filter((ammo) => sights.has(ammo));
  const loc = names.get(id) ?? { nameEn: id, nameRu: id };

  tanks.push({
    id,
    country: countryFromId(id),
    nameEn: loc.nameEn,
    nameRu: loc.nameRu,
    zoomMin,
    zoomMax,
    sights: ordered.length > 0 ? ordered : ["AP"],
  });
}

tanks.sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ version: 1, source: "datamine", tanks }, null, 2)}\n`,
);
console.log(`Wrote ${tanks.length} tanks to ${OUT}`);
