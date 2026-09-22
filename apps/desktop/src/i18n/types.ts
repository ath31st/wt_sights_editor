export const LOCALE_IDS = ["ru", "en", "de", "zh"] as const;
export type LocaleId = (typeof LOCALE_IDS)[number];

export type LocaleConfig = {
  id: LocaleId;
  nativeLabel: string;
  enabled: boolean;
};

export type PluralForms = {
  one?: string;
  few?: string;
  many?: string;
  other: string;
};

export const COUNTRY_CODES = [
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
  "other",
] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export const MESSAGE_KEYS = [
  "error",
  "loadUserTanksFailed",
  "savedUserSightsMissing",
  "pickFolderAgain",
  "globalBlkNotFound",
  "openUserSightsFailed",
  "loadSettingsFailed",
  "pickUserSightsTitle",
  "userSightsPicked",
  "folderPickedNoGlobal",
  "pickUserSightsFirst",
  "noTanksToGenerate",
  "noSights",
  "noTanksWithSights",
  "writingSightsForTank",
  "writingSightsForFilter",
  "writingSightsForAll",
  "sightsWritten",
  "sightsWrittenFilter",
  "sightsWrittenAll",
  "writeSightsFailed",
  "globalBlkWrittenCannotAssign",
  "cannotAssignSight",
  "sightWrittenAndAssigned",
  "sightAssigned",
  "sightAssignedTo",
  "assignSightFailed",
  "invalidId",
  "invalidIdHint",
  "zoomMustBeNumber",
  "tankAdded",
  "tankAddedHint",
  "saveTankFailed",
  "pickUserSights",
  "folderNotPicked",
  "searchPlaceholder",
  "countryAll",
  "language",
  "generateHint",
  "applyHint",
  "ammo",
  "globalBlkAssigned",
  "globalBlkNoEntry",
  "font",
  "generateSights",
  "generateForThisTank",
  "generateForFilter",
  "generateForAll",
  "noTanksInFilter",
  "addTankManually",
  "unitId",
  "name",
  "zoomMin",
  "zoomMax",
  "save",
  "quotedQuery",
  "samCircleNoTicks",
  "fontSample",
  "previewFooter",
] as const;
export type MessageKey = (typeof MESSAGE_KEYS)[number];

export const PLURAL_KEYS = ["catalogTankCount", "filesCount", "vehiclesCount"] as const;
export type PluralKey = (typeof PLURAL_KEYS)[number];

export type Dictionary = {
  messages: Record<MessageKey, string>;
  plurals: Record<PluralKey, PluralForms>;
  countries: Record<CountryCode, string>;
};

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;
