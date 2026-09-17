import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBlk } from "../blkParse.ts";
import { emitBlk } from "../blkEmit.ts";
import { countryFromUnitId, mergeCatalogs } from "../catalog.ts";
import { densityFor, sightFromZoom } from "../density.ts";
import { generateTankSights } from "../generate.ts";

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
  it("uses a left column and 200 m steps for AP at Somua-like zoom", () => {
    const d = densityFor(6, "AP");
    expect(d.layout).toBe("singleLeft");
    expect(d.stepM).toBe(200);
    expect(d.fontSizeMult).toBeGreaterThan(0.8);
  });

  it("uses L/R marks and a small font for APDS at Abrams zoom", () => {
    const d = densityFor(10, "APDS");
    expect(d.layout).toBe("alternateLR");
    expect(d.stepM).toBe(400);
    expect(d.fontSizeMult).toBeLessThan(0.5);
    const marks = sightFromZoom("APDS", 10).marks;
    expect(marks[0]?.sideOffset).toBeCloseTo(-0.01);
    expect(marks[1]?.sideOffset).toBeCloseTo(-0.01);
    expect(marks[0]?.textPosX).toBe(0);
    expect(marks[1]?.textPosX).toBeGreaterThan(0);
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
    const original = sightFromZoom("APDS", 10);
    const parsed = parseBlk(emitBlk(original));
    expect(parsed.layout).toBe("alternateLR");
    expect(parsed.marks.map((m) => m.meters)).toEqual(original.marks.map((m) => m.meters));
  });

  it("does not emit leftover additional ticks on APDS", () => {
    const text = emitBlk(sightFromZoom("APDS", 10));
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
