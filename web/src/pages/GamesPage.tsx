import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useGameService, useClubService } from "@/di/container";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";
import { GameRegistration } from "@/components/GameRegistration";
import { Table } from "@/components/ui";
import type { Column } from "@/components/ui";

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

export function GamesPage() {
  const { user } = useAuth();
  const gameService = useGameService();
  const clubService = useClubService();
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubData, setClubData] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState<"mine" | "all">("all");
  const dict = useDictionary().games;
  const common = useDictionary().common;

  const canToggle =
    !!user?.roles?.includes("CLUB_ADMIN") || !!user?.roles?.includes("COACH");

  const fetchGames = async () => {
    setLoading(true);
    try {
      if (view === "mine") {
        const data = await gameService.getMyGames();
        setGames(data);
      } else {
        if (!user?.clubId) {
          setGames([]);
          return;
        }
        const data = await gameService.getRecentGames(user.clubId);
        setGames(data);
      }
    } catch (err) {
      console.error("Failed to fetch games", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.clubId, gameService, view]);

  useEffect(() => {
    const fetchClub = async () => {
      if (!user?.clubId) return;
      try {
        const data = await clubService.getClubById(user.clubId);
        setClubData(data);
      } catch (err) {
        console.error("Failed to fetch club", err);
      }
    };
    fetchClub();
  }, [user?.clubId, clubService]);

  const handleDelete = async (gameId: string) => {
    setDeleting(true);
    try {
      await gameService.deleteGame(gameId);
      setDeleteConfirm(null);
      await fetchGames();
    } catch (err) {
      console.error("Failed to delete game", err);
    } finally {
      setDeleting(false);
    }
  };

  const handleGameRegistered = () => {
    setLoading(true);
    fetchGames();
  };

  const typeLabel = (type: string) => type === "SINGLES" ? dict.singles : dict.doubles;

  const columns: Column<any>[] = [
    {
      header: dict.type,
      accessor: (g) => (
        <span className="text-xs font-medium">{typeLabel(g.type)}</span>
      ),
    },
    {
      header: dict.team1,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team1Players?.map((p: any) => (
            <span key={p.id}>{playerLine(p)}</span>
          ))}
        </div>
      ),
    },
    {
      header: dict.team2,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team2Players?.map((p: any) => (
            <span key={p.id}>{playerLine(p)}</span>
          ))}
        </div>
      ),
    },
    {
      header: dict.winner,
      accessor: (g) => {
        if (!g.winner) return <span className="text-muted-foreground/70 text-xs">—</span>;
        const names = g.winner === "team1"
          ? g.team1Players?.map((p: any) => p.profile?.name || p.email?.split("@")[0] || "?").join(" & ")
          : g.team2Players?.map((p: any) => p.profile?.name || p.email?.split("@")[0] || "?").join(" & ");
        const color = g.winner === "team1" ? "text-primary" : "text-destructive";
        return <span className={`font-semibold text-xs ${color}`}>{names}</span>;
      },
    },
    {
      header: dict.result,
      accessor: (g) => (
        <div className="flex items-center gap-1">
          <span className="font-bold text-sm" title={g.setsSummary}>{g.resultSummary}</span>
          <span className={`text-[10px] uppercase font-semibold px-1 rounded ${g.isQuickMode ? "bg-success/10 text-success" : "bg-accent/10 text-accent-foreground"}`}>
            {g.isQuickMode ? dict.quickBadge : dict.setsBadge}
          </span>
        </div>
      ),
    },
    {
      header: dict.date,
      accessor: (g) => (
        <small className="text-muted-foreground" title={new Date(g.playedAt || g.createdAt).toLocaleString()}>
          {new Date(g.playedAt || g.createdAt).toLocaleDateString()}
        </small>
      ),
    },
    {
      header: "",
      className: "actions-cell",
      accessor: (g) =>
        deleteConfirm === g.id ? (
          <div className="buttons right nowrap">
            <button className="button small red" onClick={() => handleDelete(g.id)} disabled={deleting}>
              {deleting ? common.loading : dict.yes}
            </button>
            <button className="button small light" onClick={() => setDeleteConfirm(null)}>
              {dict.no}
            </button>
          </div>
        ) : (
          <div className="buttons right nowrap">
            <Link to={`/games/${g.id}`} className="button small light">
              <span className="icon"><i className="mdi mdi-eye"></i></span>
            </Link>
            <Link to={`/games/${g.id}?edit=true`} className="button small blue">
              <span className="icon"><i className="mdi mdi-pencil"></i></span>
            </Link>
            <button className="button small red" onClick={() => setDeleteConfirm(g.id)}>
              <span className="icon"><i className="mdi mdi-trash-can"></i></span>
            </button>
          </div>
        ),
    },
  ];

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">{dict.registerGame}</h1>
          {canToggle && (
            <div className="buttons">
              <button
                className={`button small ${view === "all" ? "blue" : "light"}`}
                onClick={() => setView("all")}
              >
                <span className="icon">
                  <i className="mdi mdi-account-group"></i>
                </span>
                <span>{dict.allClubGames}</span>
              </button>
              <button
                className={`button small ${view === "mine" ? "blue" : "light"}`}
                onClick={() => setView("mine")}
              >
                <span className="icon">
                  <i className="mdi mdi-account"></i>
                </span>
                <span>{dict.myGames}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="section main-section">
        <GameRegistration
          clubId={clubData?.id}
          clubPlayers={clubData?.users || []}
          onGameRegistered={handleGameRegistered}
        />

        <Table
          title={view === "mine" ? dict.myGames : dict.matchHistory}
          titleIcon={view === "mine" ? "mdi-account" : "mdi-badminton"}
          columns={columns}
          data={games}
          loading={loading}
          emptyMessage={dict.noGamesFound}
          loadingMessage={common.loading}
        />

      </section>
    </>
  );
}
