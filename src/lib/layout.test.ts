import { describe, expect, it } from "vitest";
import { clampColumns, fitToColumns, moveWidget } from "./layout";
import { widget } from "@/test/data";

const ids = (list: { id: string }[]) => list.map((w) => w.id);
const col = (list: { id: string; column: number }[], c: number) =>
  list.filter((w) => w.column === c).map((w) => w.id);

describe("clampColumns", () => {
  it("keeps the value between 2 and 4", () => {
    expect(clampColumns(1)).toBe(2);
    expect(clampColumns(3)).toBe(3);
    expect(clampColumns(9)).toBe(4);
    expect(clampColumns(3.9)).toBe(3);
  });
  it("falls back to the minimum for NaN / Infinity", () => {
    expect(clampColumns(NaN)).toBe(2);
    expect(clampColumns(Infinity)).toBe(2);
  });
});

describe("fitToColumns", () => {
  it("returns the very same array when everything already fits", () => {
    const w = [widget("a", 0), widget("b", 1), widget("c", 2)];
    expect(fitToColumns(w, 3)).toBe(w);
    expect(fitToColumns(w, 4)).toBe(w);
  });

  it("never loses a tile when columns are removed", () => {
    const w = [widget("a", 0), widget("b", 1), widget("c", 2), widget("d", 3), widget("e", 3)];
    const out = fitToColumns(w, 2);
    expect(ids(out).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(out.every((x) => x.column === 0 || x.column === 1)).toBe(true);
  });

  it("leaves tiles of remaining columns where they are", () => {
    const w = [widget("a", 0), widget("b", 1), widget("c", 3)];
    const out = fitToColumns(w, 2);
    expect(out.find((x) => x.id === "a")!.column).toBe(0);
    expect(out.find((x) => x.id === "b")!.column).toBe(1);
  });

  it("moves displaced tiles to the shortest column (leftmost on ties)", () => {
    // column 0 has 2 tiles, column 1 has 1 → the displaced tile goes to column 1
    const w = [widget("a", 0), widget("b", 0), widget("c", 1), widget("d", 2)];
    const out = fitToColumns(w, 2);
    expect(out.find((x) => x.id === "d")!.column).toBe(1);
    // equal columns → leftmost
    const tie = fitToColumns([widget("a", 0), widget("b", 1), widget("c", 2)], 2);
    expect(tie.find((x) => x.id === "c")!.column).toBe(0);
  });

  it("repairs tiles with a broken column value", () => {
    const w = [widget("a", 0), widget("b", NaN), widget("c", -1), widget("d", 1.5)];
    const out = fitToColumns(w, 2);
    expect(out).toHaveLength(4);
    expect(out.every((x) => Number.isInteger(x.column) && x.column >= 0 && x.column < 2)).toBe(
      true,
    );
  });

  it("does not modify its input", () => {
    const w = [widget("a", 0), widget("b", 3)];
    const copy = JSON.parse(JSON.stringify(w));
    fitToColumns(w, 2);
    expect(w).toEqual(copy);
  });
});

describe("moveWidget", () => {
  const base = () => [
    widget("a", 0),
    widget("b", 0),
    widget("c", 0),
    widget("x", 1),
    widget("y", 1),
  ];

  it("moves a tile to another column at a given position", () => {
    const out = moveWidget(base(), "a", 1, 1);
    expect(col(out, 1)).toEqual(["x", "a", "y"]);
    expect(col(out, 0)).toEqual(["b", "c"]);
  });

  it("puts a tile first / last", () => {
    expect(col(moveWidget(base(), "a", 1, 0), 1)).toEqual(["a", "x", "y"]);
    expect(col(moveWidget(base(), "a", 1, 2), 1)).toEqual(["x", "y", "a"]);
  });

  it("treats an index outside the column as 'last'", () => {
    expect(col(moveWidget(base(), "a", 1, -1), 1)).toEqual(["x", "y", "a"]);
    expect(col(moveWidget(base(), "a", 1, 99), 1)).toEqual(["x", "y", "a"]);
  });

  it("reorders inside the same column (index counts the OTHER tiles)", () => {
    expect(col(moveWidget(base(), "a", 0, 1), 0)).toEqual(["b", "a", "c"]);
    expect(col(moveWidget(base(), "a", 0, 2), 0)).toEqual(["b", "c", "a"]);
  });

  it("drops into an empty column", () => {
    const out = moveWidget(base(), "a", 2, 0);
    expect(col(out, 2)).toEqual(["a"]);
  });

  it("returns the same array when the tile would not move", () => {
    const w = base();
    expect(moveWidget(w, "a", 0, 0)).toBe(w);
    expect(moveWidget(w, "b", 0, 1)).toBe(w);
    expect(moveWidget(w, "c", 0, 2)).toBe(w);
    expect(moveWidget(w, "c", 0, -1)).toBe(w);
  });

  it("returns the same array for an unknown tile", () => {
    const w = base();
    expect(moveWidget(w, "nope", 1, 0)).toBe(w);
  });

  it("keeps every other tile in its column and relative order", () => {
    const out = moveWidget(base(), "b", 1, 1);
    expect(ids(out).sort()).toEqual(["a", "b", "c", "x", "y"]);
    expect(col(out, 0)).toEqual(["a", "c"]);
    expect(col(out, 1)).toEqual(["x", "b", "y"]);
  });
});
