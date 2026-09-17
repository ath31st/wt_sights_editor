import { useEffect, useMemo, useRef } from "react";
import type { SightModel } from "@wt_sights_editor/core";

type Props = {
  model: SightModel;
};

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

    ctx.font = `${Math.max(10, 11 * model.fontSizeMult * 1.4)}px sans-serif`;
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
        ctx.fillText(String(mark.label), right ? cx + 16 : cx - 16, y + 4);
      }
    });

    ctx.fillStyle = "#888";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Схема в тысячных. В игре метки расставит снаряд.", 12, h - 10);
  }, [marks, model]);

  const key = useMemo(() => JSON.stringify(model), [model]);
  return <canvas key={key} ref={ref} width={420} height={560} className="preview-canvas" />;
}
