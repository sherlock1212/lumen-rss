import type { FeedWidget } from "./rss";
import { MAX_COLUMNS, MIN_COLUMNS } from "./columns";

/** Keeps a requested column count inside what the UI supports. */
export function clampColumns(n: number): number {
  const v = Number.isFinite(n) ? Math.floor(n) : MIN_COLUMNS;
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, v));
}

/**
 * Makes a tab's tiles fit in `columns` columns without losing any of them.
 *
 * - Tiles that already sit in a remaining column are left exactly where they are.
 * - Tiles from removed columns (read left to right, top to bottom) are moved, one
 *   by one, to the end of the currently shortest remaining column (the leftmost
 *   one on ties), so the result stays balanced instead of piling up on the right.
 * - When every tile already fits (e.g. when adding columns) the same array is
 *   returned, so nothing changes and nothing needs saving.
 *
 * Within a column, tile order is the order of the array, which is why moved tiles
 * are appended after the ones that stay.
 */
export function fitToColumns(widgets: FeedWidget[], columns: number): FeedWidget[] {
  const total = Math.max(1, Math.floor(columns));
  const fits = (w: FeedWidget) => Number.isInteger(w.column) && w.column >= 0 && w.column < total;

  const kept = widgets.filter(fits);
  if (kept.length === widgets.length) return widgets;

  const counts = new Array<number>(total).fill(0);
  for (const w of kept) counts[w.column]++;

  const displaced = widgets
    .map((w, index) => ({ w, index }))
    .filter(({ w }) => !fits(w))
    .sort(
      (a, b) =>
        (Number.isFinite(a.w.column) ? a.w.column : 0) -
          (Number.isFinite(b.w.column) ? b.w.column : 0) || a.index - b.index,
    );

  const moved = displaced.map(({ w }) => {
    const target = counts.indexOf(Math.min(...counts));
    counts[target]++;
    return { ...w, column: target };
  });

  return [...kept, ...moved];
}

/**
 * Moves one tile to `column`, at position `index` among that column's OTHER tiles
 * (0 = first; anything outside 0..n, e.g. -1, = last). Every other tile keeps its
 * column and its relative order.
 *
 * Returns the same array when the move would change nothing, so dropping a tile back
 * where it was neither re-renders nor triggers a save.
 */
export function moveWidget(
  widgets: FeedWidget[],
  activeId: string,
  column: number,
  index: number,
): FeedWidget[] {
  const moving = widgets.find((w) => w.id === activeId);
  if (!moving) return widgets;

  const others = widgets.filter((w) => w.id !== activeId);
  const target = others.filter((w) => w.column === column);
  const at =
    Number.isInteger(index) && index >= 0 && index <= target.length ? index : target.length;

  const moved: FeedWidget = moving.column === column ? moving : { ...moving, column };
  const before = target[at]; // the tile the moved one lands in front of, if any
  let result: FeedWidget[];
  if (before) {
    const pos = others.indexOf(before);
    result = [...others.slice(0, pos), moved, ...others.slice(pos)];
  } else {
    // Last in its column: right after the column's current last tile, or at the end.
    const last = target[target.length - 1];
    const pos = last ? others.indexOf(last) + 1 : others.length;
    result = [...others.slice(0, pos), moved, ...others.slice(pos)];
  }

  const order = (list: FeedWidget[]) =>
    list
      .filter((w) => w.column === column)
      .map((w) => w.id)
      .join("|");
  if (moving.column === column && order(result) === order(widgets)) return widgets;
  return result;
}
