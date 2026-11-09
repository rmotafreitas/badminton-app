import type { Game } from "@bb/contracts";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { TeamAvatars } from "@/shared/components/player-avatar";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { formatShortDate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { type Outcome, outcomeFor, teamName } from "./stats";

export function OutcomeBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  const dict = useDictionary().ui.games;
  const label = outcome === "W" ? dict.won : outcome === "L" ? dict.lost : dict.draw;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-semibold",
        outcome === "W" && "bg-win/12 text-win",
        outcome === "L" && "bg-loss/12 text-loss",
        outcome === "D" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

/** A W/L dot per game, most recent first. */
export function FormDots({ form }: { form: { gameId: string; outcome: Outcome }[] }) {
  return (
    <div className="flex items-center gap-1">
      {form.map((f) => (
        <span
          key={f.gameId}
          title={f.outcome}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-[11px] font-bold",
            f.outcome === "W" && "bg-win/15 text-win",
            f.outcome === "L" && "bg-loss/15 text-loss",
            f.outcome === "D" && "bg-muted text-muted-foreground",
          )}
        >
          {f.outcome}
        </span>
      ))}
    </div>
  );
}

/** One game in a list: both teams, the score, and (for the viewer) whether they won. */
export function GameRow({ game, viewerId, className }: { game: Game; viewerId: string; className?: string }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  const outcome = outcomeFor(game, viewerId);
  const team = (side: "team1" | "team2") => {
    const players = side === "team1" ? game.team1Players : game.team2Players;
    const won = game.winner === side;
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <TeamAvatars players={players} />
        <span className={cn("truncate text-sm", won ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {teamName(players, dict.common.unknownPlayer)}
        </span>
      </div>
    );
  };
  return (
    <Link
      to="/games/$gameId"
      params={{ gameId: game.id }}
      className={cn("group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-accent/60 sm:gap-4", className)}
    >
      <div className="grid min-w-0 flex-1 gap-2">
        {team("team1")}
        {team("team2")}
      </div>
      <div className="grid shrink-0 justify-items-end gap-1.5 text-right">
        <div className="tabular flex gap-2 text-sm font-semibold">
          {game.sets.map((s, i) => (
            <span key={i} className="grid leading-tight">
              <span className={cn(s.team1Score > s.team2Score ? "text-foreground" : "text-muted-foreground")}>{s.team1Score}</span>
              <span className={cn(s.team2Score > s.team1Score ? "text-foreground" : "text-muted-foreground")}>{s.team2Score}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="hidden w-24 shrink-0 flex-col items-end gap-1 sm:flex">
        {outcome ? <OutcomeBadge outcome={outcome} /> : <Badge variant="secondary">{game.type === "SINGLES" ? dict.common.singles : dict.common.doubles}</Badge>}
        <span className="text-xs text-muted-foreground">{formatShortDate(game.playedAt, lang)}</span>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
