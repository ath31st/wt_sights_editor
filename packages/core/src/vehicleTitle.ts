/** Prefix codepoints from War Thunder `symbols_skyquake`. Without that font they render as tofu or control pictures. */
const BADGE_BY_CODEPOINT: Record<number, VehicleBadge> = {
  0xf059: "il",
  0x2417: "cn",
  0x2580: "germ",
  0x2582: "ussr",
  0x2583: "us",
  0x2584: "uk",
  0x2585: "jp",
  0x25d0: "cross",
  0x25d4: "chevron",
  0x25ca: "diamond",
  0x25cd: "squadron",
  0x2419: "trophy",
  0x2420: "paw",
  0x25cb: "skull",
  0x25c4: "burst",
};

export const COUNTRY_BADGES = ["il", "cn", "germ", "ussr", "us", "uk", "jp"] as const;

export type CountryBadge = (typeof COUNTRY_BADGES)[number];

export type VehicleBadge =
  | CountryBadge
  | "cross"
  | "chevron"
  | "diamond"
  | "squadron"
  | "trophy"
  | "paw"
  | "skull"
  | "burst";

export function isCountryBadge(badge: VehicleBadge): badge is CountryBadge {
  return (COUNTRY_BADGES as readonly string[]).includes(badge);
}

export function vehicleTitle(name: string): { badge: VehicleBadge | null; text: string } {
  const chars = [...name];
  let index = 0;
  let badge: VehicleBadge | null = null;
  while (index < chars.length) {
    const code = chars[index]?.codePointAt(0) ?? 0;
    const next = BADGE_BY_CODEPOINT[code];
    if (!next) {
      break;
    }
    badge = next;
    index += 1;
  }
  return { badge, text: chars.slice(index).join("").trimStart() };
}
