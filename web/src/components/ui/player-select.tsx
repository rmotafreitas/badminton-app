import { useState, useRef, useEffect } from "react";
import { normalizeSearch } from "@/lib/score-utils";

interface Player {
  id: string;
  name: string;
  photo?: string | null;
}

interface PlayerSelectProps {
  label: string;
  labelColor?: string;
  available: Player[];
  selected: string[];
  max: number;
  onChange: (ids: string[]) => void;
  disabledIds?: string[];
  color?: "blue" | "red";
  labels?: {
    select?: string;
    add?: string;
    search?: string;
    noMatches?: string;
    noAvailable?: string;
  };
}

export function PlayerSelect({
  label,
  labelColor,
  available,
  selected,
  max,
  onChange,
  disabledIds = [],
  color = "blue",
  labels = {},
}: PlayerSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedPlayers = available.filter((p) => selected.includes(p.id));
  const filtered = available.filter((p) => {
    if (selected.includes(p.id)) return false;
    if (disabledIds.includes(p.id)) return false;
    if (!search.trim()) return true;
    const q = normalizeSearch(search);
    return normalizeSearch(p.name).includes(q);
  });

  const togglePlayer = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else if (selected.length < max) {
      const next = [...selected, id];
      onChange(next);
      if (next.length >= max) {
        setOpen(false);
        setSearch("");
      }
    }
  };

  const chipBg = color === "blue"
    ? "bg-primary/10 text-primary border-primary/30"
    : "bg-destructive/10 text-destructive border-destructive/30";

  return (
    <div className="field" ref={ref}>
      <label className={`label text-sm sm:text-base ${labelColor || ""}`}>{label}</label>
      <div className="control">
        <div className="flex flex-wrap gap-1.5 mb-2 min-h-[2.5rem]">
          {selectedPlayers.map((p) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full text-sm font-medium border cursor-pointer active:scale-95 transition-transform ${chipBg}`}
              onClick={() => togglePlayer(p.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") togglePlayer(p.id);
              }}
            >
              {p.photo ? (
                <img src={p.photo} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-white/50 flex items-center justify-center text-xs font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </span>
              )}
              {p.name}
              <i className="mdi mdi-close text-sm"></i>
            </span>
          ))}
          {selected.length < max && (
              <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border border-dashed border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground active:scale-95 transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(!open);
                setSearch("");
              }}
            >
              <i className="mdi mdi-plus text-sm"></i>
              {selected.length === 0 ? (labels.select || "Select") : (labels.add || "Add")}
            </button>
          )}
        </div>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-hidden">
            <div className="p-2 border-b bg-muted">
              <input
                type="text"
                className="input text-base"
                placeholder={labels.search || "Search players..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-48">
              {filtered.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {search ? (labels.noMatches || "No matches") : (labels.noAvailable || "No players available")}
                </div>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-4 py-3 text-sm hover:bg-primary/5 flex items-center gap-3 border-b border-border last:border-0 active:bg-primary/10 transition-colors"
                    onClick={() => togglePlayer(p.id)}
                  >
                    {p.photo ? (
                      <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="font-medium">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
