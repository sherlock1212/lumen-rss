import { LayoutList, Check, Rows3, Rows4, Minus, AlignLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TileStyle } from "@/lib/rss";

const STYLES: { value: TileStyle; label: string; icon: typeof Rows3 }[] = [
  { value: "full", label: "Full", icon: AlignLeft },
  { value: "condensed", label: "Condensed", icon: Rows3 },
  { value: "compact", label: "Compact", icon: Rows4 },
  { value: "mini", label: "Mini", icon: Minus },
];

interface Props {
  tabStyle: TileStyle | undefined;
  globalStyle: TileStyle;
  highlightNew: boolean;
  onSetTabStyle: (s: TileStyle) => void;
  onSetGlobalStyle: (s: TileStyle) => void;
  onToggleHighlightNew: (v: boolean) => void;
}

export function StyleMenu({
  tabStyle,
  globalStyle,
  highlightNew,
  onSetTabStyle,
  onSetGlobalStyle,
  onToggleHighlightNew,
}: Props) {
  const effectiveTab = tabStyle ?? globalStyle;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-surface/60 text-foreground hover:bg-secondary transition-colors"
          aria-label="Display options"
          title="Display options"
        >
          <LayoutList className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Apply style to this tab</DropdownMenuLabel>
        {STYLES.map((s) => {
          const Icon = s.icon;
          const active = effectiveTab === s.value;
          return (
            <DropdownMenuItem
              key={`tab-${s.value}`}
              onClick={() => onSetTabStyle(s.value)}
              className="gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm flex-1">{s.label}</span>
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Apply style to all tabs</DropdownMenuLabel>
        {STYLES.map((s) => {
          const Icon = s.icon;
          const active = globalStyle === s.value;
          return (
            <DropdownMenuItem
              key={`all-${s.value}`}
              onClick={() => onSetGlobalStyle(s.value)}
              className="gap-2 cursor-pointer"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm flex-1">{s.label}</span>
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={highlightNew}
          onCheckedChange={(v) => onToggleHighlightNew(Boolean(v))}
        >
          Highlight new entries
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
