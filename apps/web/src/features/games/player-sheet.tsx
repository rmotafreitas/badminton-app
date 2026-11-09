import type { ClubMember } from "@bb/contracts";
import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary } from "@/shared/i18n";
import { tick } from "@/shared/lib/haptics";
import { normalizeSearch } from "@/shared/lib/search";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/shared/ui/input";

/**
 * Pick a player with one thumb: big rows, the people you play with most at the top, search only if you want it (no
 * keyboard pops up by itself).
 */
export function PlayerSheet({
  open,
  onOpenChange,
  title,
  members,
  value,
  taken,
  recentIds,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  members: ClubMember[];
  value: string | null;
  taken: Set<string>;
  /** Most frequent co-players first. */
  recentIds: string[];
  onPick: (id: string) => void;
}) {
  const dict = useDictionary().ui;
  const [query, setQuery] = useState("");
  const { recent, rest } = useMemo(() => {
    const q = normalizeSearch(query);
    const match = (m: ClubMember) => !q || normalizeSearch(`${m.name ?? ""} ${m.email ?? ""}`).includes(q);
    const byId = new Map(members.map((m) => [m.id, m]));
    const recentMembers = q ? [] : recentIds.map((id) => byId.get(id)).filter((m): m is ClubMember => !!m).slice(0, 6);
    const recentSet = new Set(recentMembers.map((m) => m.id));
    const others = members
      .filter((m) => match(m) && !recentSet.has(m.id))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { recent: recentMembers, rest: others };
  }, [members, recentIds, query]);

  const row = (m: ClubMember) => {
    const disabled = taken.has(m.id) && m.id !== value;
    return (
      <button
        key={m.id}
        type="button"
        role="option"
        aria-selected={value === m.id}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          tick();
          onPick(m.id);
          setQuery("");
        }}
        className={cn(
          "tap-target flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition active:scale-[0.99]",
          value === m.id ? "bg-primary/10" : "hover:bg-accent",
          disabled && "opacity-35",
        )}
      >
        <PlayerAvatar id={m.id} name={m.name} photoUrl={m.photoUrl} className="size-10" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{m.name || m.email || dict.common.unknownPlayer}</span>
          <span className="tabular block text-xs text-muted-foreground">
            {dict.common.singles} {Math.round(m.eloSingles)} · {dict.common.doubles} {Math.round(m.eloDoubles)}
          </span>
        </span>
        {value === m.id && <Check className="size-5 text-primary" />}
      </button>
    );
  };

  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={dict.common.search} className="h-11 pl-9" />
        </div>
        <div role="listbox" aria-label={title} className="space-y-4">
          {recent.length > 0 && (
            <div className="space-y-1">
              <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{dict.games.recent}</p>
              {recent.map(row)}
            </div>
          )}
          <div className="space-y-1">
            {recent.length > 0 && <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{dict.games.everyone}</p>}
            {rest.length ? rest.map(row) : <p className="p-4 text-center text-sm text-muted-foreground">{dict.games.noPlayers}</p>}
          </div>
        </div>
      </div>
    </ResponsiveSheet>
  );
}

/** The people the viewer played with or against, most frequent first. */
export function frequentPartners(games: { team1Players: { id: string }[]; team2Players: { id: string }[] }[], viewerId: string): string[] {
  const counts = new Map<string, number>();
  for (const g of games) {
    const ids = [...g.team1Players, ...g.team2Players].map((p) => p.id);
    if (!ids.includes(viewerId)) continue;
    for (const id of ids) if (id !== viewerId) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
