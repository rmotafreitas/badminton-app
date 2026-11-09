import type { Game, SessionUser } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppContext } from "@/app/context";
import { hasRole, isStaff } from "@/features/auth";
import { Page, PageHeader } from "@/shared/components/page-header";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { Card, CardContent } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";
import { clubGamesQuery, myGamesQuery } from "./api";
import { GameRow } from "./components";
import { GameFormDialog } from "./game-form";

type View = "mine" | "club";
type TypeFilter = "all" | "SINGLES" | "DOUBLES";

/** Games grouped by month, newest first. */
function byMonth(games: Game[], lang: string) {
  const groups = new Map<string, { label: string; games: Game[] }>();
  for (const game of games) {
    const d = new Date(game.playedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const group = groups.get(key) ?? { label: d.toLocaleDateString(lang, { month: "long", year: "numeric" }), games: [] };
    group.games.push(game);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function GamesPage({ user, openNew, onOpenNewChange }: { user: SessionUser; openNew: boolean; onOpenNewChange: (open: boolean) => void }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  const { api } = useAppContext();
  const [view, setView] = useState<View>(user.clubId && isStaff(user) ? "club" : "mine");
  const [type, setType] = useState<TypeFilter>("all");
  const mine = useQuery({ ...myGamesQuery(api), enabled: view === "mine" });
  const club = useQuery({ ...clubGamesQuery(api, user.clubId ?? ""), enabled: view === "club" && !!user.clubId });
  const source = view === "mine" ? mine : club;
  const games = useMemo(() => (source.data ?? []).filter((g) => type === "all" || g.type === type), [source.data, type]);

  return (
    <Page>
      <PageHeader
        title={dict.games.title}
        description={dict.games.subtitle}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="mine">{dict.games.mine}</TabsTrigger>
            {user.clubId && <TabsTrigger value="club">{dict.games.club}</TabsTrigger>}
          </TabsList>
        </Tabs>
        <ToggleGroup type="single" variant="outline" size="sm" value={type} onValueChange={(v) => v && setType(v as TypeFilter)}>
          <ToggleGroupItem value="all" className="px-3">
            {dict.games.filterAll}
          </ToggleGroupItem>
          <ToggleGroupItem value="SINGLES" className="px-3">
            {dict.common.singles}
          </ToggleGroupItem>
          <ToggleGroupItem value="DOUBLES" className="px-3">
            {dict.common.doubles}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {source.isPending ? (
        <Card>
          <CardContent className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </CardContent>
        </Card>
      ) : games.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trophy />
            </EmptyMedia>
            <EmptyTitle>{dict.games.noGames}</EmptyTitle>
            <EmptyDescription>{dict.dashboard.noGamesHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-6">
          {byMonth(games, lang).map((group) => (
            <section key={group.label} className="space-y-2">
              <h2 className="px-1 text-sm font-medium text-muted-foreground capitalize">{group.label}</h2>
              <Card className="py-2">
                <CardContent className="divide-y px-2">
                  {group.games.map((g) => (
                    <GameRow key={g.id} game={g} viewerId={user.id} />
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}

      {user.clubId && <GameFormDialog open={openNew} onOpenChange={onOpenNewChange} clubId={user.clubId} viewerId={user.id} selfDefault={hasRole(user, "PLAYER") || !isStaff(user)} />}
    </Page>
  );
}
