import { useEffect, useMemo, useRef } from "react";
import type { SightModel } from "@wt_sights_editor/core";

type Props = {
  model: SightModel;
};

/** Preview px so 0.2→0.7→1.2 are obviously different (no flat floor at 10px). */
function previewFontPx(fontSizeMult: number): number {
  return Math.round(4 + fontSizeMult * 34);
}

export function SightPreview({ model }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  const marks = model.marks;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const top = 24;

    if (model.layout === "none") {
      if (model.circleDiameter > 0) {
        const radius = model.circleDiameter * 14;
        ctx.beginPath();
        ctx.arc(cx, h / 2, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#000000";
        ctx.fill();
        ctx.strokeStyle = "#888888";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.fillStyle = "#666";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(
        model.circleDiameter > 0 ? "SAM · круг без рисок" : "Прицелов нет",
        12,
        h - 10,
      );
      return;
    }

    const milsToY = (mils: number) => top + (mils / model.verticalLength) * (h - 48);
    const milsToX = (mils: number) => cx + mils * 14;

    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, milsToY(0.5));
    ctx.lineTo(cx, milsToY(model.verticalLength));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(milsToX(-model.tickOuter), milsToY(0));
    ctx.lineTo(milsToX(-model.tickInner), milsToY(0));
    ctx.moveTo(milsToX(model.tickInner), milsToY(0));
    ctx.lineTo(milsToX(model.tickOuter), milsToY(0));
    ctx.stroke();

    const radius = Math.max(3, model.circleDiameter * 400);
    ctx.beginPath();
    ctx.arc(cx, milsToY(0), radius, 0, Math.PI * 2);
    ctx.stroke();

    const fontPx = previewFontPx(model.fontSizeMult);
    ctx.font = `${fontPx}px sans-serif`;
    ctx.fillStyle = "#f3f3f3";
    const spacing = (h - 80) / Math.max(marks.length, 1);
    marks.forEach((mark, index) => {
      const y = 36 + index * spacing;
      ctx.beginPath();
      ctx.moveTo(cx - 6, y);
      ctx.lineTo(cx + 6, y);
      ctx.stroke();
      if (mark.label > 0) {
        const right = model.layout === "alternateLR" && mark.textPosX > 0;
        ctx.textAlign = right ? "left" : "right";
        ctx.fillText(String(mark.label), right ? cx + 16 : cx - 16, y + fontPx * 0.35);
      }
    });

    // Fixed-size ghost sample (1.0) + live sample — easy to compare while dragging.
    const sampleX = 14;
    const sampleY = 28;
    const ghostPx = previewFontPx(1);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#3a3a3a";
    ctx.font = `${ghostPx}px sans-serif`;
    ctx.fillText("4  8  12", sampleX, sampleY);
    ctx.fillStyle = "#f3f3f3";
    ctx.font = `${fontPx}px sans-serif`;
    ctx.fillText("4  8  12", sampleX, sampleY);

    ctx.fillStyle = "#9a9a9a";
    ctx.font = "12px sans-serif";
    ctx.fillText(`шрифт ${model.fontSizeMult.toFixed(2)}  ·  серое = 1.00`, sampleX, sampleY + ghostPx + 6);

    ctx.fillStyle = "#666";
    ctx.font = "11px sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("Схема в тысячных. В игре метки расставит снаряд.", 12, h - 10);
  }, [marks, model]);

  const key = useMemo(() => JSON.stringify(model), [model]);
  return <canvas key={key} ref={ref} width={420} height={560} className="preview-canvas" />;
}
