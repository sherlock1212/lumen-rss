import type { DashboardState, DashboardTab, FeedWidget } from "@/lib/rss";

export const widget = (
  id: string,
  column: number,
  extra: Partial<FeedWidget> = {},
): FeedWidget => ({
  id,
  url: `https://example.com/${id}.xml`,
  column,
  ...extra,
});

export const tab = (id: string, widgets: FeedWidget[] = [], columns = 3): DashboardTab => ({
  id,
  name: `Tab ${id}`,
  columns,
  widgets,
});

export const dashboard = (
  tabs: DashboardTab[],
  activeTabId = tabs[0]?.id ?? "",
): DashboardState => ({
  tabs,
  activeTabId,
  globalDefaultStyle: "full",
  highlightNew: true,
});

/** A minimal RSS 2.0 document. */
export const rss = (
  items: { title: string; link?: string }[],
  channelLink = "https://example.com/",
) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Test feed</title><link>${channelLink}</link>` +
  items
    .map((i) => `<item><title>${i.title}</title>${i.link ? `<link>${i.link}</link>` : ""}</item>`)
    .join("") +
  `</channel></rss>`;
