import type { DistanceLayout, DistanceMark, SightModel } from "./catalog.ts";

const FONT_RE = /fontSizeMult:r=([0-9.]+)/;
const LINE_RE = /lineSizeMult:r=([0-9.]+)/;
const DIST_POS_RE = /distancePos:p2=([-\d.]+)\s*,/;
const CIRCLE_DIAM_RE = /diameter:r=([0-9.]+)/;
const CIRCLE_SIZE_RE = /size:r=([0-9.]+)/;
const VERT_RE = /line:p4=0(?:\.0)?\s*,\s*0(?:\.5)?\s*,\s*0(?:\.0)?\s*,\s*([0-9.]+)/;
const TICK_RE = /line:p4=([-\d.]+)\s*,\s*0(?:\.0)?\s*,\s*([-\d.]+)\s*,\s*0(?:\.0)?/;
const FLAT_DIST_RE = /distance:p3=(\d+)\s*,\s*(\d+)\s*,\s*([-\d.]+)/g;
const NESTED_DIST_RE =
  /distance\{distance:p3=(\d+)\s*,\s*(\d+)\s*,\s*([-\d.]+)\s*;\s*textPos:p2=([-\d.]+)\s*,/g;

export function parseBlk(text: string): SightModel {
  const fontSizeMult = Number(text.match(FONT_RE)?.[1] ?? 1);
  const lineSizeMult = Number(text.match(LINE_RE)?.[1] ?? 1);
  const distancePosX = Number(text.match(DIST_POS_RE)?.[1] ?? 0.005);
  const circleDiameter = Number(text.match(CIRCLE_DIAM_RE)?.[1] ?? 0.01);
  const circleSize = Number(text.match(CIRCLE_SIZE_RE)?.[1] ?? 2);
  const verticalLength = Number(text.match(VERT_RE)?.[1] ?? 400);

  let tickOuter = 4.1;
  let tickInner = 1.3;
  const tickMatch = text.match(TICK_RE);
  if (tickMatch) {
    tickOuter = Math.abs(Number(tickMatch[1]));
    tickInner = Math.abs(Number(tickMatch[2]));
  }

  const nested: DistanceMark[] = [];
  for (const match of text.matchAll(NESTED_DIST_RE)) {
    nested.push({
      meters: Number(match[1]),
      label: Number(match[2]),
      sideOffset: Number(match[3]),
      textPosX: Number(match[4]),
    });
  }

  const flat: DistanceMark[] = [];
  if (nested.length === 0) {
    for (const match of text.matchAll(FLAT_DIST_RE)) {
      flat.push({
        meters: Number(match[1]),
        label: Number(match[2]),
        sideOffset: Number(match[3]),
        textPosX: 0,
      });
    }
  }

  const marks = nested.length > 0 ? nested : flat;
  const layout: DistanceLayout = nested.length > 0 ? "alternateLR" : "singleLeft";

  return {
    ammo: layout === "alternateLR" ? "APDS" : "AP",
    fontSizeMult,
    lineSizeMult,
    circleDiameter,
    circleSize,
    verticalLength,
    tickOuter,
    tickInner,
    layout,
    distancePosX,
    marks,
  };
}
