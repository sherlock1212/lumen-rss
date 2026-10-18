import { describe, expect, it } from "vitest";
import { linkId, toLinkId } from "./linkId";

describe("linkId", () => {
  it("is short, stable and made only of letters and digits", () => {
    const id = linkId("https://example.com/a/b?x=1#frag");
    expect(id).toMatch(/^[a-z0-9]{6,13}$/);
    expect(linkId("https://example.com/a/b?x=1#frag")).toBe(id);
  });

  it("gives different ids to different links", () => {
    const ids = new Set(
      Array.from({ length: 5000 }, (_, i) => linkId(`https://example.com/post/${i}`)),
    );
    expect(ids.size).toBe(5000);
  });

  it("handles empty and non-ASCII input", () => {
    expect(linkId("")).toMatch(/^[a-z0-9]+$/);
    expect(linkId("https://esempio.it/città?x=è")).toMatch(/^[a-z0-9]+$/);
  });
});

describe("toLinkId", () => {
  it("keeps an id as it is", () => {
    expect(toLinkId(linkId("https://a.com/x"))).toBe(linkId("https://a.com/x"));
  });

  it("converts an old full address to its id", () => {
    expect(toLinkId("https://a.com/x")).toBe(linkId("https://a.com/x"));
    expect(toLinkId("http://a.com")).toBe(linkId("http://a.com"));
  });
});
