import type { SightModel } from "./catalog.ts";

function formatNum(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(value);
}

export function emitBlk(model: SightModel): string {
  const header = `rangefinderProgressBarColor1:c=225,255,0,125
rangefinderProgressBarColor2:c=0,0,0,1
rangefinderTextScale:r=1.0
rangefinderVerticalOffset:r=1.8
rangefinderHorizontalOffset:r=35
detectAllyTextScale:r=0.7
detectAllyOffset:p2=12,0.09
fontSizeMult:r=${formatNum(model.fontSizeMult)}
lineSizeMult:r=${formatNum(model.lineSizeMult)}
drawCentralLineVert:b=no
drawCentralLineHorz:b=no
drawDistanceCorrection:b=yes
distanceCorrectionPos:p2=-0.1,-0.05
drawSightMask:b=yes
crosshairDistHorSizeMain:p2=0,0
crosshairHorVertSize:p2=0.5,0.5
crosshairDistHorSizeAdditional:p2=0.007,0.0035
distancePos:p2=${formatNum(model.distancePosX)},0
crosshair_hor_ranges{}
`;

  let distances = "crosshair_distances{\n";
  if (model.layout === "alternateLR") {
    distances =
      `rangefinderUseThousandth:b=yes
crosshairHorVertSize:p2=2,2
drawUpward:b=no
move:b=yes
textPos:p2=-0.00001,0
textAlign:i=1
textShift:r=0.01
drawAdditionalLines:b=no
drawDistanceCorrection:b=no
` + distances;
    for (const mark of model.marks) {
      distances += `distance{distance:p3=${mark.meters},${mark.label},${formatNum(mark.sideOffset)};textPos:p2=${formatNum(mark.textPosX)},0;}\n`;
    }
  } else {
    for (const mark of model.marks) {
      distances += `distance:p3=${mark.meters},${mark.label},0\n`;
    }
  }
  distances += "}\n";

  const lines = `drawLines{
line{
line:p4=0.0,0.5,0.0,${formatNum(model.verticalLength)}
move:b=no
thousandth:b=yes
}
line{
line:p4=${formatNum(model.tickOuter)},0.0,${formatNum(model.tickInner)},0.0
move:b=no
thousandth:b=yes
}
line{
line:p4=-${formatNum(model.tickOuter)},0.0,-${formatNum(model.tickInner)},0.0
move:b=no
thousandth:b=yes
}
}

drawCircles{
circle{
segment:p2=0,360;
pos:p2=0,0;
diameter:r=${formatNum(model.circleDiameter)};
size:r=${formatNum(model.circleSize)};
move:b=no;
thousandth:b=yes;
}
}

drawTexts{
}
`;

  return `${header}\n${distances}\n${lines}`;
}
