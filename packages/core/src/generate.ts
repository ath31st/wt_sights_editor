import type { AmmoClass, CatalogTank } from "./catalog.ts";
import { emitBlk } from "./blkEmit.ts";
import { sightFromZoom } from "./density.ts";

export type GeneratedFile = {
  relativePath: string;
  contents: string;
};

export function generateTankSights(
  tank: CatalogTank,
  ammoFilter?: AmmoClass[],
  fontOverride?: number,
): GeneratedFile[] {
  const wanted = ammoFilter ?? tank.sights;
  const files: GeneratedFile[] = [];
  for (const ammo of wanted) {
    const model = sightFromZoom(ammo, tank.zoomMax, {
      fontSizeMult: fontOverride,
    });
    files.push({
      relativePath: `${tank.id}/${ammo}.blk`,
      contents: emitBlk(model),
    });
  }
  return files;
}

export function generateCatalogSights(
  tanks: CatalogTank[],
  fontOverride?: number,
): GeneratedFile[] {
  return tanks.flatMap((tank) => generateTankSights(tank, tank.sights, fontOverride));
}
