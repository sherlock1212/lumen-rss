// Where will a dragged tile land? Pure geometry, no React and no dnd-kit.
//
// The old code asked dnd-kit "which tile is closest to the dragged card?". That answer
// is unreliable with tiles of different heights, and it can never mean "after the last
// tile of a column": dropping near the bottom of a column always resolved to the last
// tile, so the dragged tile was inserted BEFORE it.
//
// Here the answer comes straight from the pointer position:
//   1. the column is the one under the pointer (or the nearest one, if the pointer is
//      in a gap or outside the grid);
//   2. inside that column, the tile goes after every other tile whose middle is above
//      the pointer. Below all tiles = last; in an empty column = first.
// The same slot drives both the marker shown while dragging and the final drop, so what
// you see is exactly what you get.

export interface TileBox {
  id: string;
  top: number;
  bottom: number;
}

export interface ColumnBox {
  col: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  tiles: TileBox[];
}

/** `index` counts the column's tiles WITHOUT the dragged one: 0 = first, n = last. */
export interface DropSlot {
  col: number;
  index: number;
}

export function distanceToBox(
  x: number,
  y: number,
  box: Pick<ColumnBox, "left" | "right" | "top" | "bottom">,
): number {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

export function computeDropSlot(
  point: { x: number; y: number },
  columns: ColumnBox[],
  draggingId: string,
): DropSlot | null {
  if (columns.length === 0) return null;

  // Nearest column; distance 0 means the pointer is inside it. Ties go to the lowest index.
  let best = columns[0];
  let bestDistance = Infinity;
  for (const c of [...columns].sort((a, b) => a.col - b.col)) {
    const d = distanceToBox(point.x, point.y, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }

  const others = best.tiles.filter((t) => t.id !== draggingId);
  let index = 0;
  for (const t of others) {
    if ((t.top + t.bottom) / 2 < point.y) index++;
    else break;
  }
  return { col: best.col, index };
}

export function sameSlot(a: DropSlot | null, b: DropSlot | null): boolean {
  return a === b || (!!a && !!b && a.col === b.col && a.index === b.index);
}

/** Reads the current on-screen boxes of all columns and their tiles from the DOM. */
export function measureColumns(root: ParentNode): ColumnBox[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-column]")).map((el) => {
    const r = el.getBoundingClientRect();
    const tiles = Array.from(el.querySelectorAll<HTMLElement>(":scope > [data-tile-id]")).map(
      (t) => {
        const b = t.getBoundingClientRect();
        return { id: t.dataset.tileId ?? "", top: b.top, bottom: b.bottom };
      },
    );
    return {
      col: Number(el.dataset.column),
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      tiles,
    };
  });
}
