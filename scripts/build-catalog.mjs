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
const AP_FAST_SPEED = 800;
const AMMO = ["AP", "AP_Fast", "HEAT", "APDS", "HE"];

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

/** Base ammo family before AP speed split. */
function mapBulletFamily(raw) {
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

function mapBulletSlot(raw, speed) {
  const family = mapBulletFamily(raw);
  if (!family) {
    return null;
  }
  if (family === "AP") {
    if (Number.isFinite(speed) && speed > AP_FAST_SPEED) {
      return "AP_Fast";
    }
    return "AP";
  }
  return family;
}

function loadNames(csvText) {
  const names = new Map();
  /** lowercase unit id → canonical casing from units.csv (game UserSights path). */
  const idByLower = new Map();
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
    const lower = id.toLowerCase();
    // Prefer first csv hit; tankmodels files are lowercased so one file → one id.
    if (!idByLower.has(lower)) {
      idByLower.set(lower, id);
    }
  }
  return { names, idByLower };
}

function canonicalUnitId(fileStem, idByLower) {
  return idByLower.get(fileStem.toLowerCase()) ?? fileStem;
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

function isClassWeapon(fileName) {
  if (
    fileName.includes("dummy") ||
    fileName.includes("smoke") ||
    fileName.includes("sensor") ||
    fileName.includes("_search") ||
    fileName.includes("_track") ||
    fileName.endsWith("_default.blkx") ||
    fileName.endsWith("_default.blk")
  ) {
    return false;
  }
  return true;
}

function isSpaaUnit(type, expClass) {
  return type === "typeSPAA" || expClass === "exp_SPAA";
}

function isSplitSam(id) {
  return /(_fcs|_launcher)$/i.test(id);
}

function extractUnitClass(text) {
  const type = text.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const expClass = text.match(/"expClass"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  return { type, expClass };
}

function isSamBullet(raw) {
  const s = raw.toLowerCase();
  return s === "aam" || s === "sam_tank" || s.startsWith("sam_");
}

function isGunBullet(raw) {
  if (isSamBullet(raw)) {
    return false;
  }
  if (mapBulletFamily(raw)) {
    return true;
  }
  const s = raw.toLowerCase();
  return s.startsWith("ap") || s.startsWith("he") || s === "ahead" || s.includes("frag");
}

function collectBulletTypes(node, out) {
  if (node == null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectBulletTypes(item, out);
    }
    return;
  }
  if (typeof node.bulletType === "string") {
    out.push(node.bulletType);
  }
  for (const value of Object.values(node)) {
    collectBulletTypes(value, out);
  }
}

/** Collect { slot, speed } from every bullet object in a weapon JSON. */
function collectBullets(node, out) {
  if (node == null || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectBullets(item, out);
    }
    return;
  }
  if (typeof node.bulletType === "string") {
    const speed = Number(node.speed);
    const slot = mapBulletSlot(node.bulletType, speed);
    if (slot) {
      out.push({ slot, speed: Number.isFinite(speed) ? speed : null });
    }
  }
  for (const value of Object.values(node)) {
    collectBullets(value, out);
  }
}

function ammoFromWeaponJson(text) {
  const speeds = new Map();
  try {
    const data = JSON.parse(text);
    const bullets = [];
    collectBullets(data, bullets);
    for (const { slot, speed } of bullets) {
      if (speed == null) {
        if (!speeds.has(slot)) {
          speeds.set(slot, null);
        }
        continue;
      }
      const prev = speeds.get(slot);
      if (prev == null || speed < prev) {
        speeds.set(slot, speed);
      }
    }
  } catch {
    // fall through empty
  }
  return speeds;
}

function bulletTypesFromWeaponJson(text) {
  const types = [];
  try {
    collectBulletTypes(JSON.parse(text), types);
  } catch {
    // fall through empty
  }
  return types;
}

const { names, idByLower } = loadNames(readFileSync(UNITS_CSV, "utf8"));
const weaponCache = new Map();
const weaponTypeCache = new Map();

function readWeaponText(fileName) {
  return readFileSync(join(WEAPON_DIR, fileName), "utf8");
}

function weaponAmmo(fileName) {
  if (weaponCache.has(fileName)) {
    return weaponCache.get(fileName);
  }
  let found = new Map();
  try {
    found = ammoFromWeaponJson(readWeaponText(fileName));
  } catch {
    found = new Map();
  }
  weaponCache.set(fileName, found);
  return found;
}

function weaponBulletTypes(fileName) {
  if (weaponTypeCache.has(fileName)) {
    return weaponTypeCache.get(fileName);
  }
  let types = [];
  try {
    types = bulletTypesFromWeaponJson(readWeaponText(fileName));
  } catch {
    types = [];
  }
  weaponTypeCache.set(fileName, types);
  return types;
}

const tanks = [];
let recased = 0;
for (const file of readdirSync(TANK_DIR)) {
  if (!file.endsWith(".blkx")) {
    continue;
  }
  const fileStem = file.replace(/\.blkx$/i, "");
  const id = canonicalUnitId(fileStem, idByLower);
  if (id !== fileStem) {
    recased += 1;
  }
  const text = readFileSync(join(TANK_DIR, file), "utf8");
  const zoom = extractGunnerZoom(text);
  if (!zoom) {
    continue;
  }
  const { zoomMin, zoomMax } = zoom;
  const { type, expClass } = extractUnitClass(text);
  const spaa = isSpaaUnit(type, expClass);

  const ammoSpeeds = new Map();
  const bulletTypes = [];
  for (const match of text.matchAll(/"blk"\s*:\s*"([^"]+)"/g)) {
    const fileName = weaponFileName(match[1]);
    if (isClassWeapon(fileName)) {
      bulletTypes.push(...weaponBulletTypes(fileName));
    }
    if (spaa || !isPrimaryWeapon(fileName)) {
      continue;
    }
    for (const [slot, speed] of weaponAmmo(fileName)) {
      const prev = ammoSpeeds.get(slot);
      if (speed == null) {
        if (!ammoSpeeds.has(slot)) {
          ammoSpeeds.set(slot, null);
        }
        continue;
      }
      if (prev == null || speed < prev) {
        ammoSpeeds.set(slot, speed);
      }
    }
  }

  let ordered;
  if (spaa) {
    if (isSplitSam(id)) {
      ordered = [];
    } else if (bulletTypes.some(isGunBullet)) {
      ordered = ["AA"];
    } else if (bulletTypes.some(isSamBullet)) {
      ordered = ["SAM"];
    } else {
      // MG-only SPAA (M45 Quad, etc.) still get the gun sight, not SAM.
      ordered = ["AA"];
    }
  } else {
    ordered = AMMO.filter((ammo) => ammoSpeeds.has(ammo));
    if (ordered.length === 0) {
      ordered = ["AP"];
    }
  }

  const loc = names.get(id) ?? { nameEn: id, nameRu: id };
  const speedsObj = {};
  if (!spaa) {
    for (const ammo of ordered) {
      const speed = ammoSpeeds.get(ammo);
      if (speed != null) {
        speedsObj[ammo] = Math.round(speed);
      }
    }
  }

  tanks.push({
    id,
    country: countryFromId(id),
    nameEn: loc.nameEn,
    nameRu: loc.nameRu,
    zoomMin,
    zoomMax,
    sights: ordered,
    ...(Object.keys(speedsObj).length > 0 ? { ammoSpeeds: speedsObj } : {}),
  });
}

tanks.sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ version: 1, source: "datamine", tanks }, null, 2)}\n`,
);
console.log(`Wrote ${tanks.length} tanks to ${OUT} (${recased} ids recased from units.csv)`);
