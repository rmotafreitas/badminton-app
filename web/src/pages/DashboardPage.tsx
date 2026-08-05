import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClubService, useGameService } from "@/di/container";
import { useDictionary, useLanguage } from "@/i18n";
import { Table, WidgetSkeleton, SkeletonRows, Skeleton } from "@/components/ui";
import {
  WinLossDonut,
  ActivityBarChart,
  EloGauge,
  TopPlayersChart,
  TypeSplitChart,
} from "@/components/ui";
import { useQuery } from "@/hooks/useQuery";
import { computePlayerStats, computeClubStats } from "@/lib/stats-utils";
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

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}) {
  return (
    <div className="card">
      <div className="card-content">
        <div className="flex items-center justify-between">
          <div className="widget-label">
            <h3>{label}</h3>
            <h1>{value}</h1>
          </div>
          <span className={`icon widget-icon ${color}`}>
            <i className={`mdi ${icon} mdi-48px`}></i>
          </span>
        </div>
      </div>
    </div>
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
  const { lang } = useLanguage();
  const locale = lang === "pt-PT" ? "pt-PT" : "en-US";

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

  // Also fetch the user's own games for personal stats
  const { data: myGamesData } = useQuery<Game[]>(
    ["games", "mine"],
    () => gameService.getMyGames(),
    { staleTime: 30_000, persist: true },
  );

  const allClubGames = useMemo(() => recentGamesData ?? [], [recentGamesData]);
  const recentGames = useMemo(() => allClubGames.slice(0, 10), [allClubGames]);
  const myGames = useMemo(() => myGamesData ?? [], [myGamesData]);

  const playerStats = useMemo(
    () => computePlayerStats(myGames, user?.userId ?? "", user?.eloSingles ?? 200, locale),
    [myGames, user?.userId, user?.eloSingles, locale],
  );

  const clubStats = useMemo(
    () => computeClubStats(allClubGames, locale),
    [allClubGames, locale],
  );

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
  const isPlayer = user?.roles?.includes("PLAYER") || user?.roles?.includes("COACH");
  const dataReady = !gamesLoading || allClubGames.length > 0;

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
        {/* Stat cards */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3 mb-4 sm:mb-6">
          {widgetsLoading ? (
            <>
              <WidgetSkeleton />
              <WidgetSkeleton />
              <WidgetSkeleton />
            </>
          ) : (
            <>
              <StatCard
                label={clubData?.name || dict.clubMembers}
                value={clubMembers}
                icon="mdi-account-group"
                color="text-primary"
              />
              <StatCard
                label={dict.totalGames}
                value={clubStats.totalGames}
                icon="mdi-badminton"
                color="text-success"
              />
              <StatCard
                label={isPlayer ? dict.yourGameCount : dict.role}
                value={isPlayer ? playerStats.total : (user?.roles?.map((r) => r.replace("_", " ")).join(", ") ?? "—")}
                icon="mdi-trophy"
                color="text-accent"
              />
            </>
          )}
        </div>

        {/* Charts row 1: Personal ELO gauge + Win/Loss donut + Game types */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3 mb-4 sm:mb-6">
          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon"><i className="mdi mdi-trophy-variant"></i></span>
                {dict.yourElo}
              </p>
            </header>
            <div className="card-content flex flex-col items-center justify-center py-6">
              {dataReady ? (
                <>
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex flex-col items-center">
                      <EloGauge elo={user?.eloSingles ?? 200} min={0} max={1000} size={130} />
                      <span className="text-xs text-muted-foreground mt-1 font-medium">{gameDict.singles}</span>
                    </div>
                    <div className="flex flex-col items-center">
                      <EloGauge elo={user?.eloDoubles ?? 200} min={0} max={1000} size={130} />
                      <span className="text-xs text-muted-foreground mt-1 font-medium">{gameDict.doubles}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-success">{playerStats.wins}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{dict.winLossRatio.split("/")[0].trim()}</p>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div>
                      <p className="text-lg font-bold text-destructive">{playerStats.losses}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{dict.winLossRatio.split("/")[1].trim()}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <Skeleton className="h-[130px] w-[130px] rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Skeleton className="h-[130px] w-[130px] rounded-full" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon"><i className="mdi mdi-chart-donut"></i></span>
                {dict.winLossRatio}
              </p>
            </header>
            <div className="card-content flex flex-col items-center justify-center py-6">
              {dataReady ? (
                <WinLossDonut wins={playerStats.wins} losses={playerStats.losses} size={170} />
              ) : (
                <Skeleton className="h-[170px] w-[170px] rounded-full" />
              )}
            </div>
          </div>

          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon"><i className="mdi mdi-chart-bar"></i></span>
                {dict.gameTypes}
              </p>
            </header>
            <div className="card-content py-4">
              {dataReady ? (
                <TypeSplitChart
                  singles={playerStats.byType.SINGLES.total}
                  doubles={playerStats.byType.DOUBLES.total}
                  height={170}
                />
              ) : (
                <Skeleton className="h-[170px] w-full" />
              )}
            </div>
          </div>
        </div>

        {/* Charts row 2: Club activity + Top players */}
        <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2 mb-4 sm:mb-6">
          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon"><i className="mdi mdi-chart-line"></i></span>
                {dict.monthlyActivity}
              </p>
            </header>
            <div className="card-content py-4">
              {dataReady ? (
                <ActivityBarChart data={clubStats.monthlyActivity} height={200} />
              ) : (
                <Skeleton className="h-[200px] w-full" />
              )}
            </div>
          </div>

          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon"><i className="mdi mdi-podium"></i></span>
                {dict.topPlayers}
              </p>
            </header>
            <div className="card-content py-4">
              {dataReady ? (
                <TopPlayersChart data={clubStats.topPlayers} height={200} />
              ) : (
                <Skeleton className="h-[200px] w-full" />
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
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
              <Link to="/profile" className="button light">
                <span className="icon"><i className="mdi mdi-account-circle"></i></span>
                <span>{dict.yourElo}</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Recent games table */}
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
