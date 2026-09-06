/**
 * Isometric projection. One formula, used by every renderer in the village.
 *
 *   screenX = (gx - gy) * 31
 *   screenY = (gx + gy) * 15.5
 *
 * Depth is gx + gy: anything with a larger sum is nearer the camera and must
 * be painted later. Everything on screen goes through sortByDepth first.
 */

export const TILE_W = 31;
export const TILE_H = 15.5;
export const GRID = 14;

export interface GridPoint {
  gx: number;
  gy: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function iso(gx: number, gy: number): ScreenPoint {
  return { x: (gx - gy) * TILE_W, y: (gx + gy) * TILE_H };
}

export function depthOf(p: GridPoint): number {
  return p.gx + p.gy;
}

/** Stable painter's-algorithm sort. Ties keep insertion order. */
export function sortByDepth<T extends GridPoint>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const d = depthOf(a.item) - depthOf(b.item);
      return d !== 0 ? d : a.i - b.i;
    })
    .map((w) => w.item);
}

/** Bounding box of the whole grid in screen space, for the SVG viewBox. */
export function gridViewBox(grid = GRID, pad = 90): string {
  const w = grid * TILE_W;
  const h = grid * TILE_H;
  return `${-w - pad} ${-pad - 70} ${2 * w + 2 * pad} ${2 * h + 2 * pad + 70}`;
}

/** Diamond outline of a single tile, centred on the tile origin. */
export function tileDiamond(gx: number, gy: number): string {
  const { x, y } = iso(gx, gy);
  return [
    `${x},${y - TILE_H}`,
    `${x + TILE_W},${y}`,
    `${x},${y + TILE_H}`,
    `${x - TILE_W},${y}`,
  ].join(" ");
}
