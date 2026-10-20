import { useState } from "react";
import {
  AlignLeft,
  Check,
  Columns2,
  Columns3,
  Columns4,
  LayoutGrid,
  Minus,
  Rows2,
  Rows3,
  Rows4,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { THEMES, useTheme } from "@/lib/useTheme";
import { MAX_COLUMNS, MIN_COLUMNS } from "@/lib/columns";
import type { TileStyle } from "@/lib/rss";

const STYLES: { value: TileStyle; label: string; icon: typeof Rows3 }[] = [
  { value: "full", label: "Full", icon: AlignLeft },
  { value: "condensed", label: "Condensed", icon: Rows3 },
  { value: "compact", label: "Compact", icon: Rows4 },
  { value: "comfortable", label: "Comfortable", icon: Rows2 },
  { value: "mini", label: "Mini", icon: Minus },
];

const COLUMN_ICONS: Record<number, typeof Columns2> = { 2: Columns2, 3: Columns3, 4: Columns4 };
const COLUMN_OPTIONS = Array.from(
  { length: MAX_COLUMNS - MIN_COLUMNS + 1 },
  (_, i) => MIN_COLUMNS + i,
);

const SWATCHES: Record<string, [string, string, string]> = {
  ember: ["#1b1816", "#dc7a53", "#dcb985"],
  cyber: ["#0a0a0f", "#ff2bd6", "#22e3ff"],
  voltage: ["#080d16", "#f3e81c", "#34dfee"],
  slate: ["#2b3344", "#7aa2f7", "#b48cf2"],
  daylight: ["#f7f8fb", "#2563eb", "#9333ea"],
};

interface Props {
  /** Columns of the active tab. */
  columns: number;
  onSetColumns: (n: number) => void;
  tabStyle: TileStyle | undefined;
  globalStyle: TileStyle;
  highlightNew: boolean;
  onSetTabStyle: (s: TileStyle) => void;
  onSetGlobalStyle: (s: TileStyle) => void;
  onToggleHighlightNew: (v: boolean) => void;
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {hint && <span className="text-[10px] text-muted-foreground/80">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

const chip = (active: boolean) =>
  `inline-flex items-center justify-center gap-1.5 rounded-md border text-xs transition ${
    active
      ? "bg-primary/20 text-primary border-primary/40"
      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
  }`;

/** One button for everything about how the dashboard looks: columns, tile style, theme. */
export function LayoutMenu({
  columns,
  onSetColumns,
  tabStyle,
  globalStyle,
  highlightNew,
  onSetTabStyle,
  onSetGlobalStyle,
  onToggleHighlightNew,
}: Props) {
  const { theme, setTheme } = useTheme();
  const [scope, setScope] = useState<"tab" | "all">("tab");

  const activeStyle = scope === "tab" ? (tabStyle ?? globalStyle) : globalStyle;
  const applyStyle = scope === "tab" ? onSetTabStyle : onSetGlobalStyle;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Layout"
          aria-label="Layout"
          className="hover-border h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-border bg-surface/60 text-foreground text-sm font-medium hover:bg-secondary transition"
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden md:inline">Layout</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-4">
        {/* Columns: the grid is always one column on small screens, so hide it there. */}
        <div className="hidden md:block">
          <Section title="Columns" hint="this tab">
            <div className="grid grid-cols-3 gap-1.5">
              {COLUMN_OPTIONS.map((n) => {
                const Icon = COLUMN_ICONS[n] ?? Columns3;
                return (
                  <button
                    key={n}
                    onClick={() => onSetColumns(n)}
                    aria-pressed={columns === n}
                    aria-label={`${n} columns`}
                    className={`${chip(columns === n)} h-8`}
                  >
                    <Icon className="h-4 w-4" />
                    {n}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        <Section title="Tile style">
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Apply tile style to">
            {(
              [
                ["tab", "This tab"],
                ["all", "All tabs"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setScope(value)}
                aria-pressed={scope === value}
                className={`${chip(scope === value)} h-7`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-0.5">
            {STYLES.map((s) => {
              const Icon = s.icon;
              const active = activeStyle === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => applyStyle(s.value)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary transition"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-left">{s.label}</span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/80">
            {scope === "tab"
              ? "Applies to every tile in this tab."
              : "Applies to every tile in every tab."}
          </p>
          <label className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/60 transition cursor-pointer">
            <span>Highlight new entries</span>
            <Switch
              checked={highlightNew}
              onCheckedChange={(v) => onToggleHighlightNew(Boolean(v))}
            />
          </label>
        </Section>

        <Section title="Theme">
          <div className="space-y-0.5">
            {THEMES.map((t) => {
              const [bg, a, b] = SWATCHES[t.id] ?? ["#000", "#fff", "#fff"];
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-secondary transition"
                >
                  <span
                    className="h-5 w-5 rounded-full border border-border shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${bg} 0%, ${bg} 40%, ${a} 70%, ${b} 100%)`,
                    }}
                  />
                  <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                    <span className="text-sm">{t.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {t.description}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </Section>
      </PopoverContent>
    </Popover>
  );
}
