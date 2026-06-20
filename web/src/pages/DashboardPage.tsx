import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useClubService, useGameService } from "@/di/container";
import { useDictionary } from "@/i18n";
import { Table } from "@/components/ui";
import type { Column } from "@/components/ui";

function playerImg(player: any, cls: string) {
  if (player?.profile?.photo) {
    return <img src={player.profile.photo} alt="" className={cls} />;
  }
  const initial = (player?.profile?.name || player?.email || "?")[0].toUpperCase();
  return (
    <span className={`${cls} bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-500`}>
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
  const [clubData, setClubData] = useState<any>(null);
  const [recentGames, setRecentGames] = useState<any[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const dict = useDictionary().dashboard;
  const gameDict = useDictionary().games;
  const common = useDictionary().common;

  useEffect(() => {
    const fetchClubData = async () => {
      if (!user?.clubId) return;
      try {
        const data = await clubService.getClubById(user.clubId);
        setClubData(data);
      } catch (err) {
        console.error("Failed to fetch club", err);
      }
    };
    fetchClubData();
  }, [user?.clubId, clubService]);

  useEffect(() => {
    const fetchGames = async () => {
      if (!user?.clubId) {
        setLoadingGames(false);
        return;
      }
      try {
        const games = await gameService.getRecentGames(user.clubId);
        setRecentGames(games.slice(0, 10));
      } catch (err) {
        console.error("Failed to fetch games", err);
      } finally {
        setLoadingGames(false);
      }
    };
    fetchGames();
  }, [user?.clubId, gameService]);

  useEffect(() => {
    const updateTimeAndGreeting = () => {
      const now = new Date();
      const hour = now.getHours();
      if (hour < 12) setGreeting(dict.goodMorning);
      else if (hour < 18) setGreeting(dict.goodAfternoon);
      else setGreeting(dict.goodEvening);
    };
    updateTimeAndGreeting();
    const interval = setInterval(updateTimeAndGreeting, 1000);
    return () => clearInterval(interval);
  }, [dict]);

  const clubMembers = clubData?.users?.length ?? 0;
  const totalGames = recentGames.length;
  const myGames = recentGames.filter(
    (g: any) =>
      g.team1PlayerIds?.includes(user?.userId) ||
      g.team2PlayerIds?.includes(user?.userId),
  ).length;

  const typeLabel = (type: string) => type === "SINGLES" ? gameDict.singles : gameDict.doubles;

  const gameColumns: Column<any>[] = [
    {
      header: gameDict.type,
      accessor: (g) => <span className="text-xs font-medium">{typeLabel(g.type)}</span>,
    },
    {
      header: gameDict.team1,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team1Players?.map((p: any) => <span key={p.id}>{playerLine(p)}</span>)}
        </div>
      ),
    },
    {
      header: gameDict.team2,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team2Players?.map((p: any) => <span key={p.id}>{playerLine(p)}</span>)}
        </div>
      ),
    },
    {
      header: gameDict.result,
      accessor: (g) => (
        <div className="flex items-center gap-1">
          <span className="font-bold text-sm" title={g.setsSummary}>{g.resultSummary}</span>
          <span className={`text-[10px] uppercase font-semibold px-1 rounded ${g.isQuickMode ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"}`}>
            {g.isQuickMode ? gameDict.quickBadge : gameDict.setsBadge}
          </span>
        </div>
      ),
    },
    {
      header: gameDict.date,
      accessor: (g) => (
        <small className="text-gray-500" title={new Date(g.playedAt || g.createdAt).toLocaleString()}>
          {new Date(g.playedAt || g.createdAt).toLocaleDateString()}
        </small>
      ),
    },
  ];

  return (
    <>
      <section className="is-title-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <ul>
            <li>Admin</li>
            <li>{dict.dashboard}</li>
          </ul>
        </div>
      </section>

      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">
            {greeting}, {user?.email?.split("@")[0] || dict.userFallback}!
          </h1>
        </div>
      </section>

      <section className="section main-section">
        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-3 mb-4 sm:mb-6">
          <div className="card">
            <div className="card-content">
              <div className="flex items-center justify-between">
                <div className="widget-label">
                  <h3>{clubData?.name || dict.clubMembers}</h3>
                  <h1>{clubMembers}</h1>
                </div>
                <span className="icon widget-icon text-blue-500">
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
                <span className="icon widget-icon text-green-500">
                  <i className="mdi mdi-badminton mdi-48px"></i>
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-content">
              <div className="flex items-center justify-between">
                {user?.roles?.includes("PLAYER") || user?.roles?.includes("COACH") ? (
                  <div className="widget-label">
                    <h3>{dict.yourGameCount}</h3>
                    <h1>{myGames}</h1>
                  </div>
                ) : (
                  <div className="widget-label">
                    <h3>{dict.role}</h3>
                    <h1 className="text-xl">
                      {user?.roles?.map((r: string) => r.replace("_", " ")).join(", ")}
                    </h1>
                  </div>
                )}
                <span className="icon widget-icon text-purple-500">
                  <i className="mdi mdi-trophy mdi-48px"></i>
                </span>
              </div>
            </div>
          </div>
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
          loading={loadingGames}
          emptyMessage={dict.noRecentGames}
          loadingMessage={common.loading}
        />
      </section>
    </>
  );
}
