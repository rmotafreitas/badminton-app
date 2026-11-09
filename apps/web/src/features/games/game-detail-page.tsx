import type { Game, SessionUser } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Trash2, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { isStaff } from "@/features/auth";
import { Page } from "@/shared/components/page-header";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { formatDate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { deleteGame, forgetGame, gameQuery, invalidateAfterGame } from "./api";
import { OutcomeBadge } from "./components";
import { GameFormDialog } from "./game-form";
import { outcomeFor, sideOf } from "./stats";

function TeamColumn({ game, side }: { game: Game; side: "team1" | "team2" }) {
  const dict = useDictionary().ui;
  const players = side === "team1" ? game.team1Players : game.team2Players;
  const won = game.winner === side;
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-3 text-center", !won && "opacity-80")}>
      <div className="flex -space-x-3">
        {players.map((p) => (
          <Link key={p.id} to="/profile/$userId" params={{ userId: p.id }}>
            <PlayerAvatar id={p.id} name={p.name} photoUrl={p.photoUrl} className={cn("size-12 ring-4 ring-card sm:size-16 md:size-20", won && "ring-primary/30")} />
          </Link>
        ))}
      </div>
      <div className="space-y-0.5">
        {players.map((p) => (
          <Link key={p.id} to="/profile/$userId" params={{ userId: p.id }} className="block font-medium break-words hover:underline">
            {p.name || dict.common.unknownPlayer}
          </Link>
        ))}
      </div>
      {won && (
        <Badge className="gap-1 bg-gold/20 text-gold-foreground hover:bg-gold/20 dark:text-gold">
          <Trophy className="size-3" /> {dict.games.winner}
        </Badge>
      )}
    </div>
  );
}

export function GameDetailPage({ gameId, user, slot }: { gameId: string; user: SessionUser; slot?: React.ReactNode }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  const { api, queryClient } = useAppContext();
  const navigate = useNavigate();
  const { data: game } = useQuery(gameQuery(api, gameId, queryClient));
  const [editing, setEditing] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteGame(api, gameId),
    onSuccess: async () => {
      toast.success(dict.games.deleted);
      forgetGame(queryClient, gameId);
      void invalidateAfterGame(queryClient);
      await navigate({ to: "/games" });
    },
  });
  if (!game) return null;
  const outcome = outcomeFor(game, user.id);
  const canChange = isStaff(user) || sideOf(game, user.id) !== null;

  return (
    <Page className="max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/games">
            <ArrowLeft /> {dict.games.title}
          </Link>
        </Button>
        {canChange && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {dict.common.edit}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 /> {dict.common.delete}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{dict.games.deleteTitle}</AlertDialogTitle>
                  <AlertDialogDescription>{dict.games.deleteBody}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{dict.common.cancel}</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => remove.mutate()}>
                    {dict.common.delete}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Card className="overflow-hidden pt-0">
        <div className="flex items-center justify-center gap-2 border-b bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Badge variant="secondary">{game.type === "SINGLES" ? dict.common.singles : dict.common.doubles}</Badge>
          <span>{formatDate(game.playedAt, lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          {outcome && <OutcomeBadge outcome={outcome} />}
        </div>
        <CardContent className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-6 sm:gap-4 sm:px-6 md:gap-10 md:py-10">
          <TeamColumn game={game} side="team1" />
          <div className="tabular text-center">
            <div className="text-4xl font-bold tracking-tight whitespace-nowrap sm:text-5xl md:text-6xl">
              <span className={cn(game.winner === "team1" ? "text-primary" : "text-muted-foreground")}>{game.isQuickMode ? game.sets[0]?.team1Score : game.team1SetsWon}</span>
              <span className="px-1 text-muted-foreground/50 sm:px-2">:</span>
              <span className={cn(game.winner === "team2" ? "text-primary" : "text-muted-foreground")}>{game.isQuickMode ? game.sets[0]?.team2Score : game.team2SetsWon}</span>
            </div>
            {!game.isQuickMode && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-sm text-muted-foreground sm:gap-2">
                {game.sets.map((s, i) => (
                  <span key={i} className="rounded-md bg-muted px-2 py-0.5">
                    {s.team1Score}–{s.team2Score}
                  </span>
                ))}
              </div>
            )}
          </div>
          <TeamColumn game={game} side="team2" />
        </CardContent>
      </Card>

      {slot}

      <GameFormDialog open={editing} onOpenChange={setEditing} clubId={game.clubId} game={game} viewerId={user.id} selfDefault={false} />
    </Page>
  );
}
