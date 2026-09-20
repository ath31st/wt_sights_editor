import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBlk } from "../blkParse.ts";
import { emitBlk } from "../blkEmit.ts";
import { countryFromUnitId, mergeCatalogs } from "../catalog.ts";
import { densityFor, sightFromZoom } from "../density.ts";
import { generateTankSights } from "../generate.ts";
import { parseTankCrosshairs, setTankCrosshair } from "../tankSightSettings.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("countryFromUnitId", () => {
  it("does not put ussr into us", () => {
    expect(countryFromUnitId("us_m1a2_abrams")).toBe("us");
    expect(countryFromUnitId("ussr_t_80u")).toBe("ussr");
    expect(countryFromUnitId("germ_pzkpfw_VI_ausf_e_tiger")).toBe("germ");
    expect(countryFromUnitId("space_shuttle")).toBe("other");
  });
});

describe("density", () => {
  it("uses dense L/R marks every 200 m for slow AP", () => {
    const d = densityFor(6, "AP", 6);
    expect(d.layout).toBe("alternateLR");
    expect(d.stepM).toBe(200);
    expect(d.numberEvery).toBe(1);
    expect(d.fontSizeMult).toBeGreaterThan(0.8);
    const marks = sightFromZoom("AP", 6, {}, 6).marks;
    expect(marks[0]?.meters).toBe(200);
    expect(marks[0]?.label).toBe(2);
    expect(marks[1]?.meters).toBe(400);
    expect(marks[1]?.label).toBe(4);
    expect(marks[1]?.textPosX).toBeGreaterThan(0);
  });

  it("uses sparse left-column marks for AP_Fast", () => {
    const d = densityFor(6, "AP_Fast", 6);
    expect(d.layout).toBe("singleLeft");
    expect(d.stepM).toBe(200);
    expect(d.numberEvery).toBe(2);
    const marks = sightFromZoom("AP_Fast", 6, {}, 6).marks;
    expect(marks.some((m) => m.meters === 200 && m.label === 0)).toBe(true);
    expect(marks.some((m) => m.meters === 400 && m.label === 4)).toBe(true);
  });

  it("uses L/R marks for APDS at Abrams zoom", () => {
    const d = densityFor(10, "APDS", 3);
    expect(d.layout).toBe("alternateLR");
    expect(d.stepM).toBe(400);
    expect(d.fontSizeMult).toBeGreaterThanOrEqual(0.6);
    expect(d.fontSizeMult).toBeLessThanOrEqual(0.8);
    const marks = sightFromZoom("APDS", 10, {}, 3).marks;
    expect(marks[0]?.sideOffset).toBeCloseTo(-0.01);
    expect(marks[1]?.sideOffset).toBeCloseTo(-0.01);
    expect(marks[0]?.textPosX).toBe(0);
    expect(marks[1]?.textPosX).toBeGreaterThan(0);
  });

  it("keeps larger APDS font on fixed high-power optics like Scimitar", () => {
    const d = densityFor(10, "APDS", 9.8);
    expect(d.fontSizeMult).toBeGreaterThanOrEqual(0.85);
  });

  it("targets ~0.7 APDS for Badger-like 2–8× zoom", () => {
    expect(densityFor(8, "APDS", 2).fontSizeMult).toBeCloseTo(0.7);
  });

  it("keeps the same center tick width for AP, APDS, and AP_Fast", () => {
    const ap = densityFor(6, "AP", 6);
    const apds = densityFor(10, "APDS", 3);
    const fast = densityFor(6, "AP_Fast", 6);
    expect(ap.tickOuter).toBe(fast.tickOuter);
    expect(ap.tickInner).toBe(fast.tickInner);
    expect(apds.tickOuter).toBe(fast.tickOuter);
    expect(apds.tickInner).toBe(fast.tickInner);
  });
});

describe("blk parse/emit", () => {
  it("reads Somua-style flat distances", () => {
    const text = readFileSync(join(fixtures, "somua_ap.blk"), "utf8");
    const model = parseBlk(text);
    expect(model.layout).toBe("singleLeft");
    expect(model.fontSizeMult).toBeCloseTo(0.99);
    expect(model.marks[0]?.meters).toBe(200);
    expect(model.marks.some((m) => m.meters === 400 && m.label === 4)).toBe(true);
  });

  it("reads Abrams-style nested L/R distances", () => {
    const text = readFileSync(join(fixtures, "abrams_apds.blk"), "utf8");
    const model = parseBlk(text);
    expect(model.layout).toBe("alternateLR");
    expect(model.fontSizeMult).toBeCloseTo(0.35);
    expect(model.marks).toHaveLength(10);
    expect(model.marks[1]?.textPosX).toBeGreaterThan(0);
  });

  it("round-trips generated APDS", () => {
    const original = sightFromZoom("APDS", 10, {}, 3);
    const parsed = parseBlk(emitBlk(original));
    expect(parsed.layout).toBe("alternateLR");
    expect(parsed.marks.map((m) => m.meters)).toEqual(original.marks.map((m) => m.meters));
  });

  it("does not emit leftover additional ticks on APDS", () => {
    const text = emitBlk(sightFromZoom("APDS", 10, {}, 3));
    const last = [...text.matchAll(/crosshairDistHorSizeAdditional:p2=([0-9.]+),([0-9.]+)/g)].at(-1);
    expect(last?.[1]).toBe("0.0");
    expect(last?.[2]).toBe("0.0");
  });
});

describe("generate", () => {
  it("writes AP.blk / HEAT.blk names without ab prefix", () => {
    const files = generateTankSights({
      id: "us_m1a2_abrams",
      country: "us",
      nameEn: "M1A2 Abrams",
      nameRu: "M1A2 Abrams",
      zoomMin: 3,
      zoomMax: 10,
      sights: ["APDS", "HEAT"],
    });
    expect(files.map((f) => f.relativePath)).toEqual([
      "us_m1a2_abrams/APDS.blk",
      "us_m1a2_abrams/HEAT.blk",
    ]);
  });

  it("writes both AP.blk and AP_Fast.blk when both slots are present", () => {
    const files = generateTankSights({
      id: "us_m24_chaffee",
      country: "us",
      nameEn: "M24",
      nameRu: "M24",
      zoomMin: 3.5,
      zoomMax: 7,
      sights: ["AP", "AP_Fast", "HE"],
      ammoSpeeds: { AP: 618, AP_Fast: 868, HE: 463 },
    });
    expect(files.map((f) => f.relativePath)).toEqual([
      "us_m24_chaffee/AP.blk",
      "us_m24_chaffee/AP_Fast.blk",
      "us_m24_chaffee/HE.blk",
    ]);
  });
});

describe("mergeCatalogs", () => {
  it("lets local extras override bundled tanks", () => {
    const merged = mergeCatalogs(
      {
        version: 1,
        source: "datamine",
        tanks: [
          {
            id: "us_m1a2_abrams",
            country: "us",
            nameEn: "M1A2 Abrams",
            nameRu: "M1A2 Abrams",
            zoomMin: 3,
            zoomMax: 10,
            sights: ["APDS"],
          },
        ],
      },
      [
        {
          id: "us_m1a2_abrams",
          country: "us",
          nameEn: "M1A2 Abrams",
          nameRu: "M1A2 Abrams",
          zoomMin: 3,
          zoomMax: 12,
          sights: ["APDS", "HEAT"],
        },
      ],
    );
    expect(merged.tanks[0]?.zoomMax).toBe(12);
    expect(merged.tanks[0]?.sights).toEqual(["APDS", "HEAT"]);
  });
});

const GLOBAL_FIXTURE = `header{
  keep:t="yes"
}

      tankSightSettings{
        ussr_t_72b_1989{
          crosshair:t="abAPDS"
          crosshairColor:c=0, 0, 0, 255

          rangefinder{
            visible:b=yes
            textColor:c=0, 0, 0, 255
          }

          bulletType{
            visible:b=no
          }
        }

        jp_type_99{
          crosshair:t="abAP"
        }

        germ_puma{
          crosshairColor:c=0, 0, 0, 255
        }
      }

trailer{
  after:i=1
}
`;

describe("tankSightSettings", () => {
  it("reads top-level crosshair names", () => {
    const map = parseTankCrosshairs(GLOBAL_FIXTURE);
    expect(map.get("ussr_t_72b_1989")).toBe("abAPDS");
    expect(map.get("jp_type_99")).toBe("abAP");
    expect(map.has("germ_puma")).toBe(false);
  });

  it("replaces only crosshair:t and leaves rangefinder / trailer intact", () => {
    const next = setTankCrosshair(GLOBAL_FIXTURE, "ussr_t_72b_1989", "APDS");
    expect(next).toContain('ussr_t_72b_1989{\n          crosshair:t="APDS"');
    expect(next).toContain("rangefinder{\n            visible:b=yes");
    expect(next).toContain("bulletType{\n            visible:b=no");
    expect(next).toContain('jp_type_99{\n          crosshair:t="abAP"');
    expect(next.startsWith('header{\n  keep:t="yes"')).toBe(true);
    expect(next.endsWith("trailer{\n  after:i=1\n}\n")).toBe(true);
    expect(parseTankCrosshairs(next).get("ussr_t_72b_1989")).toBe("APDS");
  });

  it("inserts a missing tank with the in-game Save field set", () => {
    const next = setTankCrosshair(GLOBAL_FIXTURE, "uk_fv107_scimitar", "APDS");
    expect(next).toContain(`        germ_puma{
          crosshairColor:c=0, 0, 0, 255
        }

        uk_fv107_scimitar{`);
    expect(next).toContain(`        uk_fv107_scimitar{
          crosshair:t="APDS"
          crosshairColor:c=0, 0, 0, 255
          crosshairLightColor:c=255, 64, 64, 255
          shotDistScaleOffset:i=0

          bulletType{
            visible:b=no
            isShortName:b=no
            textColor:c=0, 0, 0, 255
            bgColor:c=0, 0, 0, 0
            nightVisionTextColor:c=0, 0, 0, 255
            nightVisionBgColor:c=0, 0, 0, 0
            lightTextColor:c=0, 0, 0, 255
            lightBgColor:c=0, 0, 0, 0
            thermalTextColor:c=0, 0, 0, 255
            thermalBgColor:c=0, 0, 0, 0
            position:p2=700, 202
            textSize:i=30
            font:t=""
          }
        }
      }`);
    expect(parseTankCrosshairs(next).get("uk_fv107_scimitar")).toBe("APDS");
    expect(parseTankCrosshairs(next).get("ussr_t_72b_1989")).toBe("abAPDS");
  });

  it("does not add a leading blank line when tankSightSettings is empty", () => {
    const empty = `      tankSightSettings{
      }
`;
    const next = setTankCrosshair(empty, "uk_fv107_scimitar", "APDS");
    expect(next.startsWith(`      tankSightSettings{
        uk_fv107_scimitar{`)).toBe(true);
  });

  it("expands a bare crosshair-only tank into the Save field set", () => {
    const next = setTankCrosshair(GLOBAL_FIXTURE, "jp_type_99", "AP");
    expect(next).toContain(`        jp_type_99{
          crosshair:t="AP"
          crosshairColor:c=0, 0, 0, 255
          crosshairLightColor:c=255, 64, 64, 255
          shotDistScaleOffset:i=0

          bulletType{`);
    expect(next).toContain("rangefinder{\n            visible:b=yes");
    expect(parseTankCrosshairs(next).get("jp_type_99")).toBe("AP");
  });

  it("inserts crosshair:t when the tank block has none", () => {
    const next = setTankCrosshair(GLOBAL_FIXTURE, "germ_puma", "HEAT");
    expect(next).toContain(`        germ_puma{
          crosshair:t="HEAT"
          crosshairColor:c=0, 0, 0, 255
        }`);
    expect(parseTankCrosshairs(next).get("germ_puma")).toBe("HEAT");
  });

  it("preserves CRLF when patching", () => {
    const crlf = GLOBAL_FIXTURE.replaceAll("\n", "\r\n");
    const next = setTankCrosshair(crlf, "ussr_t_72b_1989", "APDS");
    expect(next).toContain("\r\n");
    expect(next).not.toMatch(/(?<!\r)\n/);
    expect(next).toContain('ussr_t_72b_1989{\r\n          crosshair:t="APDS"');
  });
});
