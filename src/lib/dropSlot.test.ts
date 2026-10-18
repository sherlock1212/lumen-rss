// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  computeDropSlot,
  distanceToBox,
  measureColumns,
  sameSlot,
  type ColumnBox,
} from "./dropSlot";

// Two columns side by side; column 0 has tiles at 0-100 and 120-300, column 1 is empty.
const columns: ColumnBox[] = [
  {
    col: 0,
    left: 0,
    right: 100,
    top: 0,
    bottom: 400,
    tiles: [
      { id: "a", top: 0, bottom: 100 },
      { id: "b", top: 120, bottom: 300 },
    ],
  },
  { col: 1, left: 110, right: 210, top: 0, bottom: 400, tiles: [] },
];

describe("computeDropSlot", () => {
  it("is null when there are no columns", () => {
    expect(computeDropSlot({ x: 1, y: 1 }, [], "a")).toBeNull();
  });

  it("goes first when the pointer is above the middle of the first tile", () => {
    expect(computeDropSlot({ x: 50, y: 10 }, columns, "z")).toEqual({ col: 0, index: 0 });
  });

  it("goes between tiles", () => {
    expect(computeDropSlot({ x: 50, y: 110 }, columns, "z")).toEqual({ col: 0, index: 1 });
  });

  it("goes LAST when the pointer is below every tile (the old bug)", () => {
    expect(computeDropSlot({ x: 50, y: 380 }, columns, "z")).toEqual({ col: 0, index: 2 });
  });

  it("ignores the dragged tile itself when counting", () => {
    // dragging "a": the only other tile is "b" (middle 210)
    expect(computeDropSlot({ x: 50, y: 380 }, columns, "a")).toEqual({ col: 0, index: 1 });
    expect(computeDropSlot({ x: 50, y: 5 }, columns, "a")).toEqual({ col: 0, index: 0 });
  });

  it("uses an empty column", () => {
    expect(computeDropSlot({ x: 150, y: 200 }, columns, "a")).toEqual({ col: 1, index: 0 });
  });

  it("picks the nearest column when the pointer is in a gap or outside", () => {
    expect(computeDropSlot({ x: 104, y: 200 }, columns, "z")?.col).toBe(0);
    expect(computeDropSlot({ x: 108, y: 200 }, columns, "z")?.col).toBe(1);
    expect(computeDropSlot({ x: 900, y: 900 }, columns, "z")?.col).toBe(1);
    expect(computeDropSlot({ x: -50, y: -50 }, columns, "z")?.col).toBe(0);
  });
});

describe("distanceToBox / sameSlot", () => {
  const box = { left: 10, right: 20, top: 10, bottom: 20 };
  it("is 0 inside and positive outside", () => {
    expect(distanceToBox(15, 15, box)).toBe(0);
    expect(distanceToBox(25, 15, box)).toBe(5);
    expect(distanceToBox(23, 24, box)).toBe(5);
  });
  it("compares slots", () => {
    expect(sameSlot(null, null)).toBe(true);
    expect(sameSlot({ col: 1, index: 2 }, { col: 1, index: 2 })).toBe(true);
    expect(sameSlot({ col: 1, index: 2 }, { col: 1, index: 3 })).toBe(false);
    expect(sameSlot(null, { col: 0, index: 0 })).toBe(false);
  });
});

describe("measureColumns", () => {
  it("reads columns and their direct tiles from the DOM", () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-column="0"><div data-tile-id="a"><div data-tile-id="nested"></div></div><div data-tile-id="b"></div></div>
        <div data-column="1"></div>
      </div>`;
    const out = measureColumns(document.getElementById("root")!);
    expect(out.map((c) => c.col)).toEqual([0, 1]);
    expect(out[0].tiles.map((t) => t.id)).toEqual(["a", "b"]); // nested tile is not counted
    expect(out[1].tiles).toEqual([]);
  });
});
