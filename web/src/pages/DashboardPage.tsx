import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClubService, useGameService } from "@/di/container";
import { useDictionary } from "@/i18n";
import { Table } from "@/components/ui";
import { WidgetSkeleton, SkeletonRows } from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import type { Column } from "@/components/ui";
import type { Club } from "@/core/domain/club";
import type { Game } from "@/core/domain/game";

function playerImg(player: any, cls: string) {
  if (player?.profile?.photo) {
    return <img src={player.profile.photo} alt="" className={cls} />;
  }
  const initial = (player?.profile?.name || player?.email || "?")[0].toUpperCase();
  return (
    <span className={`${cls} bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground`}>
      {initial}
    </span>
  );
}

function playerLine(player: any) {
  return (
    <span className="inline-flex items-center gap-1">
      {playerImg(player, "w-5 h-5 rounded-full object-cover shrink-0")}
      <span>{player?.profile?.name || player?.email?.split("@")[0] || "?"}</span>
    </span>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const clubService = useClubService();
  const gameService = useGameService();
  const [greeting, setGreeting] = useState("");
  const dict = useDictionary().dashboard;
  const gameDict = useDictionary().games;
  const common = useDictionary().common;

  const clubId = user?.clubId ?? "";

  const { data: clubData, isLoading: clubLoading } = useQuery<Club>(
    ["club", clubId],
    () => clubService.getClubById(clubId),
    { enabled: !!clubId, staleTime: 60_000, persist: true },
  );

  const { data: recentGamesData, isLoading: gamesLoading, refetch: refetchGames, isFetching: gamesFetching } = useQuery<Game[]>(
    ["games", "recent", clubId],
    () => gameService.getRecentGames(clubId),
    { enabled: !!clubId, staleTime: 30_000, persist: true },
  );

  const recentGames = (recentGamesData ?? []).slice(0, 10);

  useEffect(() => {
    const compute = () => {
      const hour = new Date().getHours();
      const next =
        hour < 12 ? dict.goodMorning : hour < 18 ? dict.goodAfternoon : dict.goodEvening;
      setGreeting((prev) => (prev === next ? prev : next));
    };
    compute();
    const interval = setInterval(compute, 60_000);
    return () => clearInterval(interval);
  }, [dict]);

  const clubMembers = clubData?.users?.length ?? 0;
  const totalGames = recentGames.length;
  const myGames = recentGames.filter(
    (g) =>
      g.team1PlayerIds?.includes(user?.userId ?? "") ||
      g.team2PlayerIds?.includes(user?.userId ?? ""),
  ).length;

  const typeLabel = (type: string) => type === "SINGLES" ? gameDict.singles : gameDict.doubles;

  const gameColumns: Column<Game>[] = [
    {
      header: gameDict.type,
      accessor: (g) => <span className="text-xs font-medium">{typeLabel(g.type)}</span>,
    },
    {
      header: gameDict.team1,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team1Players?.map((p) => <span key={p.id}>{playerLine(p)}</span>)}
        </div>
      ),
    },
    {
      header: gameDict.team2,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team2Players?.map((p) => <span key={p.id}>{playerLine(p)}</span>)}
        </div>
      ),
    },
    {
      header: gameDict.result,
      accessor: (g) => (
        <div className="flex items-center gap-1">
          <span className="font-bold text-sm" title={g.setsSummary}>{g.resultSummary}</span>
          <span className={`text-[10px] uppercase font-semibold px-1 rounded ${g.isQuickMode ? "bg-success/10 text-success" : "bg-accent/10 text-accent-foreground"}`}>
            {g.isQuickMode ? gameDict.quickBadge : gameDict.setsBadge}
          </span>
        </div>
      ),
    },
    {
      header: gameDict.date,
      accessor: (g) => (
        <small className="text-muted-foreground" title={new Date(g.playedAt || g.createdAt).toLocaleString()}>
          {new Date(g.playedAt || g.createdAt).toLocaleDateString()}
        </small>
      ),
    },
  ];

  const widgetsLoading = clubLoading && !clubData;
  const isPlayer = user?.roles?.includes("PLAYER") || user?.roles?.includes("COACH");

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">
            {greeting}, {user?.email?.split("@")[0] || dict.userFallback}!
          </h1>
        </div>
      </section>

      <section className="section main-section">
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3 mb-4 sm:mb-6">
          {widgetsLoading ? (
            <>
              <WidgetSkeleton />
              <WidgetSkeleton />
              <WidgetSkeleton />
            </>
          ) : (
            <>
              <div className="card">
                <div className="card-content">
                  <div className="flex items-center justify-between">
                    <div className="widget-label">
                      <h3>{clubData?.name || dict.clubMembers}</h3>
                      <h1>{clubMembers}</h1>
                    </div>
                    <span className="icon widget-icon text-primary">
                      <i className="mdi mdi-account-group mdi-48px"></i>
                    </span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-content">
                  <div className="flex items-center justify-between">
                    <div className="widget-label">
                      <h3>{dict.totalGames}</h3>
                      <h1>{totalGames}</h1>
                    </div>
                    <span className="icon widget-icon text-success">
                      <i className="mdi mdi-badminton mdi-48px"></i>
                    </span>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-content">
                  <div className="flex items-center justify-between">
                    {isPlayer ? (
                      <div className="widget-label">
                        <h3>{dict.yourGameCount}</h3>
                        <h1>{myGames}</h1>
                      </div>
                    ) : (
                      <div className="widget-label">
                        <h3>{dict.role}</h3>
                        <h1 className="text-xl">
                          {user?.roles?.map((r) => r.replace("_", " ")).join(", ")}
                        </h1>
                      </div>
                    )}
                    <span className="icon widget-icon text-accent">
                      <i className="mdi mdi-trophy mdi-48px"></i>
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="card mb-4 sm:mb-6">
          <header className="card-header">
            <p className="card-header-title">
              <span className="icon"><i className="mdi mdi-lightning-bolt"></i></span>
              {dict.quickActions}
            </p>
          </header>
          <div className="card-content">
            <div className="flex flex-wrap gap-4">
              <Link to="/games" className="button blue">
                <span className="icon"><i className="mdi mdi-badminton"></i></span>
                <span>{dict.registerNewGame}</span>
              </Link>
            </div>
          </div>
        </div>

        <Table
          title={dict.recentGames}
          titleIcon="mdi-history"
          columns={gameColumns}
          data={recentGames}
          loading={gamesLoading && recentGames.length === 0}
          emptyMessage={dict.noRecentGames}
          loadingMessage={common.loading}
          skeletonRows={<SkeletonRows rows={5} cols={5} />}
          refetch={refetchGames}
          isFetching={gamesFetching}
        />
      </section>
    </>
  );
}
