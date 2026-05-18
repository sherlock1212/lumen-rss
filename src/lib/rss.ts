export interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  author?: string;
}

export interface FeedData {
  title: string;
  link?: string;
  description?: string;
  items: FeedItem[];
  fetchedAt: string;
}

export type TileStyle = "full" | "condensed" | "compact";

export interface FeedWidget {
  id: string;
  url: string;
  customTitle?: string;
  column: number;
  style?: TileStyle;
}

export interface DashboardTab {
  id: string;
  name: string;
  widgets: FeedWidget[];
  columns: number;
}

export interface DashboardState {
  tabs: DashboardTab[];
  activeTabId: string;
}

export async function fetchFeed(url: string): Promise<FeedData> {
  const res = await fetch(`/api/feed?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
