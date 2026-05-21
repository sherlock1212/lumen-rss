import { Palette, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/lib/useTheme";

const SWATCHES: Record<string, [string, string, string]> = {
  aurora: ["#1a2236", "#3ddfb1", "#c98aff"],
  cyber: ["#0a0a0f", "#ff2bd6", "#22e3ff"],
  slate: ["#2b3344", "#7aa2f7", "#b48cf2"],
  daylight: ["#f7f8fb", "#2563eb", "#9333ea"],
};

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-surface/60 text-foreground hover:bg-secondary transition-colors"
          aria-label="Change theme"
          title="Change theme"
        >
          <Palette className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themes.map((t) => {
          const [bg, a, b] = SWATCHES[t.id] ?? ["#000", "#fff", "#fff"];
          const active = t.id === theme;
          return (
            <DropdownMenuItem
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="gap-2 cursor-pointer"
            >
              <span
                className="h-5 w-5 rounded-full border border-border shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${bg} 0%, ${bg} 40%, ${a} 70%, ${b} 100%)`,
                }}
              />
              <div className="flex flex-col leading-tight flex-1 min-w-0">
                <span className="text-sm">{t.name}</span>
                <span className="text-[10px] text-muted-foreground truncate">
                  {t.description}
                </span>
              </div>
              {active && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
