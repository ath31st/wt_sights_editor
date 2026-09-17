export const AMMO_CLASSES = ["AP", "HEAT", "APDS", "HE"] as const;
export type AmmoClass = (typeof AMMO_CLASSES)[number];

export type DistanceLayout = "singleLeft" | "alternateLR";

export type CatalogTank = {
  id: string;
  country: string;
  nameEn: string;
  nameRu: string;
  zoomMin: number;
  zoomMax: number;
  sights: AmmoClass[];
};

export type CatalogFile = {
  version: number;
  source: string;
  tanks: CatalogTank[];
};

export type DistanceMark = {
  meters: number;
  label: number;
  sideOffset: number;
  textPosX: number;
};

export type SightModel = {
  ammo: AmmoClass;
  fontSizeMult: number;
  lineSizeMult: number;
  circleDiameter: number;
  circleSize: number;
  verticalLength: number;
  tickOuter: number;
  tickInner: number;
  layout: DistanceLayout;
  distancePosX: number;
  marks: DistanceMark[];
};

export type DensityParams = {
  fontSizeMult: number;
  layout: DistanceLayout;
  stepM: number;
  minM: number;
  maxM: number;
  numberEvery: number;
  tickOuter: number;
  tickInner: number;
  circleSize: number;
};

export const COUNTRY_ORDER = [
  "us",
  "germ",
  "ussr",
  "uk",
  "jp",
  "it",
  "fr",
  "cn",
  "sw",
  "il",
] as const;

export const COUNTRY_LABELS_RU: Record<string, string> = {
  us: "США",
  germ: "Германия",
  ussr: "СССР",
  uk: "Великобритания",
  jp: "Япония",
  it: "Италия",
  fr: "Франция",
  cn: "Китай",
  sw: "Швеция",
  il: "Израиль",
  other: "Прочее",
};

export function countryFromUnitId(id: string): string {
  const prefix = id.split("_")[0] ?? "";
  if ((COUNTRY_ORDER as readonly string[]).includes(prefix)) {
    return prefix;
  }
  return "other";
}

export function countryLabelRu(code: string): string {
  return COUNTRY_LABELS_RU[code] ?? code;
}

export function isAmmoClass(value: string): value is AmmoClass {
  return (AMMO_CLASSES as readonly string[]).includes(value);
}

export function mergeCatalogs(bundled: CatalogFile, extra: CatalogTank[]): CatalogFile {
  const byId = new Map<string, CatalogTank>();
  for (const tank of bundled.tanks) {
    byId.set(tank.id, tank);
  }
  for (const tank of extra) {
    byId.set(tank.id, tank);
  }
  return {
    version: bundled.version,
    source: bundled.source,
    tanks: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function emptyUserCatalog(): CatalogTank[] {
  return [];
}
