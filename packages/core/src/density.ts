import type { AmmoClass, DensityParams, DistanceMark, SightModel } from "./catalog.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Derived from clean community sights:
 * Somua AP Fast (font ~0.99, 200 m ticks / 400 m numbers, left column),
 * Abrams / T-80 APDS (L/R, 400 m, small font at high zoom),
 * Abrams HEAT (left column, slightly shorter ticks).
 */
export function densityFor(zoomMax: number, ammo: AmmoClass): DensityParams {
  const zoom = zoomMax > 0 ? zoomMax : 4;

  if (ammo === "APDS") {
    return {
      layout: "alternateLR",
      stepM: 400,
      minM: 400,
      maxM: 4000,
      numberEvery: 1,
      fontSizeMult: round1(clamp(3.5 / zoom, 0.2, 0.95)),
      tickOuter: 2.1,
      tickInner: 0.9,
      circleSize: 1.8,
    };
  }

  if (ammo === "HE") {
    return {
      layout: "singleLeft",
      stepM: 100,
      minM: 100,
      maxM: zoom >= 8 ? 2000 : 1600,
      numberEvery: 2,
      fontSizeMult: round1(clamp(6 / zoom, 0.5, 1.1)),
      tickOuter: 4.8,
      tickInner: 1.5,
      circleSize: 2.5,
    };
  }

  const isHeat = ammo === "HEAT";
  return {
    layout: "singleLeft",
    stepM: 200,
    minM: 200,
    maxM: zoom >= 8 ? 4000 : 3600,
    numberEvery: 2,
    fontSizeMult: round1(clamp(8 / zoom, 0.35, 1.05)),
    tickOuter: isHeat ? 3.4 : 4.1,
    tickInner: isHeat ? 1.1 : 1.3,
    circleSize: isHeat ? 1.8 : 2.5,
  };
}

export function marksFromDensity(params: DensityParams): DistanceMark[] {
  const marks: DistanceMark[] = [];
  let index = 0;
  for (let meters = params.minM; meters <= params.maxM + 0.1; meters += params.stepM) {
    const showNumber =
      params.numberEvery === 1
        ? true
        : meters % (params.stepM * params.numberEvery) === 0;
    const label = showNumber ? Math.round(meters / 100) : 0;

    if (params.layout === "alternateLR") {
      const right = index % 2 === 1;
      marks.push({
        meters,
        label,
        sideOffset: right ? -0.004 : 0.0027,
        textPosX: right ? (index >= 3 ? 0.03 : 0.024) : 0,
      });
    } else {
      marks.push({
        meters,
        label,
        sideOffset: 0,
        textPosX: 0,
      });
    }
    index += 1;
  }
  return marks;
}

export function sightFromZoom(
  ammo: AmmoClass,
  zoomMax: number,
  overrides: Partial<Pick<SightModel, "fontSizeMult" | "tickOuter" | "tickInner">> = {},
): SightModel {
  const density = densityFor(zoomMax, ammo);
  return {
    ammo,
    fontSizeMult: overrides.fontSizeMult ?? density.fontSizeMult,
    lineSizeMult: 1,
    circleDiameter: 0.01,
    circleSize: density.circleSize,
    verticalLength: 400,
    tickOuter: overrides.tickOuter ?? density.tickOuter,
    tickInner: overrides.tickInner ?? density.tickInner,
    layout: density.layout,
    distancePosX: 0.005,
    marks: marksFromDensity(density),
  };
}

export { clamp };
