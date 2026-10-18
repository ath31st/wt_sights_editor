/**
 * Сборка data/catalog.json из датамйна War Thunder (gszabi99/War-Thunder-Datamine).
 * Запуск: `npm run catalog:build`.
 *
 * Что делает по шагам:
 * 1. syncDatamine — sparse-клон или обновление кэша (.cache/datamine), если не задан WT_DATAMINE.
 * 2. loadNames — английские/русские имена и «правильный» регистр id из units.csv (строки *_shop).
 * 3. Цикл по tankmodels/*.blkx: зум наводчика, страна, слоты прицелов, скорости снарядов.
 * 4. В конец файла дописываются название и дата патча из data/patch.json.
 *
 * Куда лезть, если каталог врёт:
 * - кратность зума          → FOV_REF, extractGunnerZoom
 * - не тот слот (AP/HEAT/…) → mapBulletFamily, mapBulletSlot, AP_FAST_SPEED, AMMO
 * - ЗСУ стала танком или наоборот, пустые прицелы у ПУ/СУО → блок `if (spaa)` в цикле,
 *   isSpaaUnit, isSplitSam, isGunBullet, isSamBullet
 * - пулемёт попал в основные орудия или миномёт выпал → isPrimaryWeapon
 * - кривое имя или id не как в игре → loadNames, canonicalUnitId
 * - датамйн не обновился / не хватает файлов → syncDatamine, DATAMINE_SPARSE, WT_DATAMINE
 *
 * Слоты прицелов, которые понимает приложение: AP, AP_Fast, HEAT, APDS, HE, AA, SAM
 * (packages/core/src/catalog.ts). Этот скрипт AA и SAM обычным танкам не ставит.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Кэш датамйна. Переменная WT_DATAMINE подменяет путь и отключает git pull. */
const DEFAULT_DATAMINE = join(ROOT, ".cache", "datamine");
const DATAMINE = process.env.WT_DATAMINE ?? DEFAULT_DATAMINE;
const DATAMINE_REMOTE = "https://github.com/gszabi99/War-Thunder-Datamine.git";
/**
 * Что забирать sparse-checkout'ом. Остальной репозиторий не нужен:
 * модели танков, таблица имён, JSON орудий наземки.
 */
const DATAMINE_SPARSE = [
  "aces.vromfs.bin_u/gamedata/units/tankmodels",
  "lang.vromfs.bin_u/lang",
  "aces.vromfs.bin_u/gamedata/weapons/groundmodels_weapons",
];
const TANK_DIR = join(DATAMINE, "aces.vromfs.bin_u/gamedata/units/tankmodels");
const WEAPON_DIR = join(DATAMINE, "aces.vromfs.bin_u/gamedata/weapons/groundmodels_weapons");
const UNITS_CSV = join(DATAMINE, "lang.vromfs.bin_u/lang/units.csv");
const OUT = join(ROOT, "data/catalog.json");
const PATCH_FILE = join(ROOT, "data/patch.json");

/**
 * «Единичный» FOV в градусах. Кратность = FOV_REF / fov орудия, округление до 0.1.
 * zoomOutFov (широкий угол) → zoomMin, zoomInFov (узкий) → zoomMax.
 * Систематически кривой зум по всему каталогу — крутить эту константу.
 */
const FOV_REF = 73.68;
/**
 * Граница слотов AP и AP_Fast, м/с. Быстрее 800 → AP_Fast.
 * Та же цифра, что в packages/core/src/density.ts (плотная шкала vs редкая).
 */
const AP_FAST_SPEED = 800;
/**
 * Порядок слотов обычной техники в поле sights. Фильтр ниже оставляет только те,
 * для которых нашёлся снаряд. AA и SAM сюда не входят — их ставит ветка ЗСУ.
 */
const AMMO = ["AP", "AP_Fast", "HEAT", "APDS", "HE"];

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/**
 * Клон или быстрое обновление sparse-кэша перед чтением.
 * WT_DATAMINE задан — каталог только читается, git не трогаем (удобно для своего чекаута).
 * Каталог есть, а .git нет — выходим: иначе можно затереть чужие файлы.
 */
function syncDatamine() {
  if (process.env.WT_DATAMINE) {
    console.log(`Using WT_DATAMINE=${DATAMINE} without updating it`);
    return;
  }
  if (!existsSync(DATAMINE)) {
    console.log(`Cloning datamine into ${DATAMINE}`);
    mkdirSync(dirname(DATAMINE), { recursive: true });
    runGit(
      ["clone", "--filter=blob:none", "--sparse", "--depth", "1", DATAMINE_REMOTE, DATAMINE],
      ROOT,
    );
  } else if (!existsSync(join(DATAMINE, ".git"))) {
    console.error(`${DATAMINE} exists but is not a git checkout. Remove it and run again.`);
    process.exit(1);
  } else {
    console.log(`Updating datamine in ${DATAMINE}`);
    runGit(["fetch", "--filter=blob:none", "--depth", "1", "origin", "master"], DATAMINE);
    runGit(["reset", "--hard", "origin/master"], DATAMINE);
  }
  runGit(["sparse-checkout", "set", ...DATAMINE_SPARSE], DATAMINE);
  runGit(["log", "-1", "--format=Datamine %h %s"], DATAMINE);
}

/**
 * Мета патча из data/patch.json в корень catalog.json.
 * nameRu, иначе старое поле name; nameEn и date опциональны.
 * Пустые строки в каталог не пишем.
 */
function loadPatchMeta() {
  const raw = JSON.parse(readFileSync(PATCH_FILE, "utf8"));
  const nameRu = (
    typeof raw.nameRu === "string" ? raw.nameRu : typeof raw.name === "string" ? raw.name : ""
  ).trim();
  const nameEn = typeof raw.nameEn === "string" ? raw.nameEn.trim() : "";
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  return {
    ...(nameRu ? { patchNameRu: nameRu } : {}),
    ...(nameEn ? { patchNameEn: nameEn } : {}),
    ...(date ? { catalogDate: date } : {}),
  };
}

/** Разбор одной строки units.csv: разделитель `;`, кавычки и удвоенные кавычки внутри поля. */
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

/** Градусы FOV → кратность. Нечисло и ≤ 0 — нет зума, танк дальше выкинется. */
function fovToZoom(fov) {
  if (!Number.isFinite(fov) || fov <= 0) {
    return null;
  }
  return Math.round((FOV_REF / fov) * 10) / 10;
}

/**
 * Страна — префикс id до первого `_` (us_m1a2 → us).
 * Список должен совпадать с COUNTRY_ORDER в packages/core/src/catalog.ts.
 * Неизвестный префикс (прем без страны, техника события) → other.
 */
const KNOWN_COUNTRIES = new Set(["us", "germ", "ussr", "uk", "jp", "it", "fr", "cn", "sw", "il"]);

function countryFromId(id) {
  const prefix = id.split("_")[0] || "other";
  return KNOWN_COUNTRIES.has(prefix) ? prefix : "other";
}

/**
 * Семейство снаряда до разреза AP / AP_Fast.
 * Смотрит подстроку bulletType, порядок проверок важен: apds раньше любых ap*,
 * иначе APDS уедет в AP.
 * Точное "ap" намеренно отбрасывается — это не слот прицела (для ЗСУ такой тип
 * всё ещё считается пушечным, см. isGunBullet).
 * Незнакомый тип → null, в sights он не попадёт.
 */
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

/** AP со скоростью выше AP_FAST_SPEED становится слотом AP_Fast. Остальные семейства как есть. */
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

/**
 * Имена и канонический регистр id из units.csv.
 * Берём только строки, чей ключ кончается на _shop: это карточка техники в ангаре.
 * fields[0] — ключ, fields[1] — английское имя, fields[6] — русское.
 * idByLower нужен потому, что файлы tankmodels лежат в нижнем регистре,
 * а путь UserSights в игре — с регистром из csv. Первое попадание побеждает.
 */
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
    // Первое попадание в csv. Файлы tankmodels в нижнем регистре, один файл — один id.
    if (!idByLower.has(lower)) {
      idByLower.set(lower, id);
    }
  }
  return { names, idByLower };
}

/** Имя файла .blkx → id как в игре. Нет строки в csv — оставляем stem файла. */
function canonicalUnitId(fileStem, idByLower) {
  return idByLower.get(fileStem.toLowerCase()) ?? fileStem;
}

/**
 * Кратность прицела наводчика из blkx танка.
 * В файле несколько пар zoomOutFov / zoomInFov (командир, бинокль, пулемёт).
 * Пара считается оптикой наводчика, если оба FOV в (0, 45) — шире уже не пушечный прицел.
 * Из таких пар берём ту, рядом с которой (в пределах ~900 символов) есть sightName.
 * Нет sightName — первая узкая пара, затем любая с zoomOut < 45, затем первая вообще.
 * zoomMin — из широкого угла (zoomOut), zoomMax — из узкого (zoomIn).
 */
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

/**
 * Путь оружия из танка (`blk`) → имя файла в groundmodels_weapons.
 * В танке часто `foo.blk`, на диске датамйна файл называется `foo.blkx`.
 */
function weaponFileName(blkPath) {
  const normalized = blkPath.replaceAll("\\", "/").toLowerCase();
  const name = normalized.split("/").pop() ?? "";
  return name.endsWith(".blk") ? `${name}x` : name;
}

/**
 * Основное орудие танка: его снаряды дают слоты AP/HEAT/… и ammoSpeeds.
 * Пушка / gun / гаубица — да, кроме пулемёта, дыма, болванки и зенитки (aa_gun).
 * «gun» есть и в machinegun, поэтому пулемёт доходит до второго if и отсекается.
 * Миномёт и безоткатка — тоже основные, даже если в имени нет cannon/gun/howitzer.
 */
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

/**
 * Оружие, по которому ЗСУ относим к AA или SAM.
 * Шире, чем isPrimaryWeapon: сюда входят и зенитки. Выкидываем мусор:
 * дым, болванки, радары поиска/сопровождения, дефолтные заглушки.
 */
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

/** ЗСУ по полям самой модели: type или expClass. */
function isSpaaUnit(type, expClass) {
  return type === "typeSPAA" || expClass === "exp_SPAA";
}

/**
 * Разрезанные ЗРК: отдельно машина СУО (`*_fcs`) и пусковая (`*_launcher`).
 * Целого прицела у половинки нет — в каталоге sights будет пустым.
 */
function isSplitSam(id) {
  return /(_fcs|_launcher)$/i.test(id);
}

function extractUnitClass(text) {
  const type = text.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const expClass = text.match(/"expClass"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  return { type, expClass };
}

/** Ракета ЗРК / ЗУР. aam тоже сюда: в наземке так помечены некоторые зенитные ракеты. */
function isSamBullet(raw) {
  const s = raw.toLowerCase();
  return s === "aam" || s === "sam_tank" || s.startsWith("sam_");
}

/**
 * Снаряд ствольной зенитки. Ракета — нет.
 * Семья из mapBulletFamily, либо имя начинается на ap/he, либо ahead/frag
 * (программируемые и осколочные, которые в слот танка не мапятся, но это всё ещё пушка).
 */
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

/** Все строки bulletType в JSON оружия, без скоростей. Нужны только чтобы отличить AA от SAM. */
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

/**
 * Пары { slot, speed } по каждому объекту с bulletType.
 * Слот не смапился (незнакомый тип, голое "ap") — снаряд пропускаем.
 */
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

/**
 * По одному JSON оружия: слот → минимальная скорость, м/с.
 * Минимум, а не максимум: шкалу прицела строим по самому медленному снаряду слота.
 * Скорости нет — слот всё равно запоминаем (значение null), чтобы он попал в sights.
 */
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
    // Битый JSON оружия — пустая карта, танк от этого не падает.
  }
  return speeds;
}

function bulletTypesFromWeaponJson(text) {
  const types = [];
  try {
    collectBulletTypes(JSON.parse(text), types);
  } catch {
    // Битый JSON — как будто типов нет, ветка ЗСУ уйдёт в запасной AA.
  }
  return types;
}

syncDatamine();

const { names, idByLower } = loadNames(readFileSync(UNITS_CSV, "utf8"));
/** Кэш разбора орудий: один и тот же .blkx висит на десятках танков. */
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
  // Нет оптики наводчика — в каталог не кладём (прицепы, некоторые вспомогательные).
  if (!zoom) {
    continue;
  }
  const { zoomMin, zoomMax } = zoom;
  const { type, expClass } = extractUnitClass(text);
  const spaa = isSpaaUnit(type, expClass);

  // ammoSpeeds — только основные орудия обычных танков.
  // bulletTypes — все «классовые» стволы, чтобы решить AA vs SAM у ЗСУ.
  const ammoSpeeds = new Map();
  const bulletTypes = [];
  for (const match of text.matchAll(/"blk"\s*:\s*"([^"]+)"/g)) {
    const fileName = weaponFileName(match[1]);
    if (isClassWeapon(fileName)) {
      bulletTypes.push(...weaponBulletTypes(fileName));
    }
    // У ЗСУ скорости танковых слотов не считаем: прицел один, AA или SAM.
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
      // Снова минимум: несколько орудий, берём самый медленный снаряд слота.
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
      // Пушка важнее ракеты: машина со стволом и ЗУР получает AA, не SAM.
      ordered = ["AA"];
    } else if (bulletTypes.some(isSamBullet)) {
      ordered = ["SAM"];
    } else {
      // Чисто пулемётная ЗСУ (M45 Quad и похожие) — всё равно пушечный прицел, не SAM.
      ordered = ["AA"];
    }
  } else {
    ordered = AMMO.filter((ammo) => ammoSpeeds.has(ammo));
    // Орудие есть, но ни один bulletType не смапился — запасной слот AP, чтобы танк не остался без прицела.
    if (ordered.length === 0) {
      ordered = ["AP"];
    }
  }

  const loc = names.get(id) ?? { nameEn: id, nameRu: id };
  const speedsObj = {};
  // ЗСУ без ammoSpeeds: у AA/SAM шкала не от скорости снаряда.
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
const patch = loadPatchMeta();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ version: 1, source: "datamine", ...patch, tanks }, null, 2)}\n`,
);
const stamp = [patch.patchNameRu, patch.patchNameEn, patch.catalogDate]
  .filter(Boolean)
  .join(" · ");
console.log(
  `Wrote ${tanks.length} tanks to ${OUT} (${recased} ids recased from units.csv)` +
    (stamp ? `; ${stamp}` : ""),
);
