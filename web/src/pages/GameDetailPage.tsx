import { useEffect, useState, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useGameService, useClubService } from "@/di/container";
import { useDictionary } from "@/i18n";
import { PlayerSelect } from "@/components/ui";
import { checkScore } from "@/lib/score-utils";
import type { GameType } from "@/core/domain/game";

type GameSet = { team1Score: number; team2Score: number };

interface Player {
  id: string;
  name: string;
  photo?: string | null;
}

function playerLine(p: any) {
  const src = p?.profile?.photo;
  return (
    <span className="inline-flex items-center gap-1.5">
      {src ? (
        <img src={src} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
      ) : (
        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
          {(p?.profile?.name || p?.email || "?")[0].toUpperCase()}
        </span>
      )}
      <span>{p?.profile?.name || p?.email?.split("@")[0] || "?"}</span>
    </span>
  );
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function setsEqual(a: GameSet[], b: GameSet[]) {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.team1Score === b[i].team1Score && s.team2Score === b[i].team2Score);
}

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = searchParams.get("edit") === "true";

  const gameService = useGameService();
  const clubService = useClubService();
  const dict = useDictionary().games;
  const common = useDictionary().common;

  const playerLabels = {
    select: dict.selectPlayer,
    add: dict.addPlayer,
    search: dict.searchPlayers,
    noMatches: dict.noMatches,
    noAvailable: dict.noPlayersAvailable,
  };

  const [game, setGame] = useState<any>(null);
  const [clubData, setClubData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Edit form state
  const [gameType, setGameType] = useState<GameType>("SINGLES");
  const [team1Players, setTeam1Players] = useState<string[]>([]);
  const [team2Players, setTeam2Players] = useState<string[]>([]);
  const [sets, setSets] = useState<GameSet[]>([{ team1Score: 0, team2Score: 0 }]);
  const [playedAt, setPlayedAt] = useState("");

  // Original values for dirty detection
  const [origType, setOrigType] = useState<GameType>("DOUBLES");
  const [origTeam1, setOrigTeam1] = useState<string[]>([]);
  const [origTeam2, setOrigTeam2] = useState<string[]>([]);
  const [origSets, setOrigSets] = useState<GameSet[]>([]);
  const [origDate, setOrigDate] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const g = await gameService.getGameById(id);
        setGame(g);
        setGameType(g.type); setOrigType(g.type);
        setTeam1Players([...g.team1PlayerIds]); setOrigTeam1([...g.team1PlayerIds]);
        setTeam2Players([...g.team2PlayerIds]); setOrigTeam2([...g.team2PlayerIds]);
        const s = g.sets?.length > 0 ? [...g.sets] : [{ team1Score: 0, team2Score: 0 }];
        setSets(s); setOrigSets(s.map((x: GameSet) => ({ ...x })));
        const d = g.playedAt ? new Date(g.playedAt).toISOString().slice(0, 10) : "";
        setPlayedAt(d); setOrigDate(d);

        if (g.clubId) {
          const club = await clubService.getClubById(g.clubId);
          setClubData(club);
        }
      } catch (err) {
        console.error("Failed to load game", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, gameService, clubService]);

  const maxPerSide = gameType === "SINGLES" ? 1 : 2;

  const players: Player[] = useMemo(
    () =>
      (clubData?.users || []).map((p: any) => ({
        id: p.id,
        name: p.profile?.name || p.email?.split("@")[0] || "?",
        photo: p.profile?.photo || null,
      })),
    [clubData],
  );

  const updateSetScore = (idx: number, team: 1 | 2, score: number) => {
    setSets((prev) => {
      const n = [...prev];
      n[idx] = { ...n[idx], [`team${team}Score`]: score };
      return n;
    });
  };

  const isDirty =
    gameType !== origType ||
    !arraysEqual(team1Players, origTeam1) ||
    !arraysEqual(team2Players, origTeam2) ||
    !setsEqual(sets, origSets) ||
    playedAt !== origDate;

  const handleReset = () => {
    setGameType(origType);
    setTeam1Players([...origTeam1]);
    setTeam2Players([...origTeam2]);
    setSets(origSets.map((s) => ({ ...s })));
    setPlayedAt(origDate);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(false);

    if (team1Players.length !== maxPerSide || team2Players.length !== maxPerSide) {
      setError(dict.validationPlayers); return;
    }
    for (const s of sets) {
      if (s.team1Score === 0 && s.team2Score === 0) { setError(dict.scoreNotEntered); return; }
      const errKey = checkScore(s.team1Score, s.team2Score);
      if (errKey) { setError((dict as any)[errKey] || errKey); return; }
    }

    setSaving(true);
    try {
      const payload: any = { type: gameType, team1PlayerIds: team1Players, team2PlayerIds: team2Players, sets };
      if (playedAt) payload.playedAt = new Date(playedAt).toISOString();

      const updated = await gameService.updateGame(id!, payload);
      setGame(updated);
      setOrigType(gameType);
      setOrigTeam1([...team1Players]);
      setOrigTeam2([...team2Players]);
      setOrigSets(sets.map((s) => ({ ...s })));
      setOrigDate(playedAt);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || dict.failedToRegister);
    } finally {
      setSaving(false);
    }
  };

  const sideALabel = gameType === "SINGLES" ? dict.playerLabel : dict.pairA;
  const sideBLabel = gameType === "SINGLES" ? dict.opponentLabel : dict.pairB;
  const typeLabel = (t: string) => t === "SINGLES" ? dict.singles : dict.doubles;

  if (loading) {
    return (
      <section className="section main-section">
        <div className="p-8 text-center">{common.loading}</div>
      </section>
    );
  }

  if (!game) {
    return (
      <section className="section main-section">
        <div className="notification red">{dict.noGamesFound}</div>
      </section>
    );
  }

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">{isEditing ? dict.editGame : dict.viewGame}</h1>
        </div>
      </section>

      <section className="section main-section">
        {error && (
          <div className="notification red mb-4">
            <div><span className="icon"><i className="mdi mdi-alert"></i></span>{error}</div>
          </div>
        )}
        {success && (
          <div className="notification green mb-4">
            <div><span className="icon"><i className="mdi mdi-check"></i></span>{dict.gameUpdated}</div>
          </div>
        )}

        {isEditing && (
          <div className="card mb-4 sm:mb-6">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon"><i className="mdi mdi-pencil"></i></span>
                {dict.editGame}
              </p>
            </header>
            <div className="card-content">
              <div className="mb-4">
                <label className="label">{dict.type}</label>
                <div className="buttons">
                  <button type="button" className={`button small ${gameType === "SINGLES" ? "blue" : "light"}`} onClick={() => setGameType("SINGLES")}>
                    <span className="icon"><i className="mdi mdi-account"></i></span>
                    <span>{dict.singles}</span>
                  </button>
                  <button type="button" className={`button small ${gameType === "DOUBLES" ? "blue" : "light"}`} onClick={() => setGameType("DOUBLES")}>
                    <span className="icon"><i className="mdi mdi-account-multiple"></i></span>
                    <span>{dict.doubles}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <PlayerSelect label={sideALabel} labelColor="text-primary" available={players} selected={team1Players} max={maxPerSide} onChange={setTeam1Players} disabledIds={team2Players} color="blue" labels={playerLabels} />
                <PlayerSelect label={sideBLabel} labelColor="text-destructive" available={players} selected={team2Players} max={maxPerSide} onChange={setTeam2Players} disabledIds={team1Players} color="red" labels={playerLabels} />
              </div>

              <hr />

              <div className="my-4">
                <label className="label">{dict.set}s</label>
                <div className="space-y-2">
                  {sets.map((set, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-muted p-2 rounded border">
                      <span className="text-xs font-bold text-muted-foreground/80 w-5 shrink-0">{idx + 1}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary shrink-0">{dict.team1}</span>
                        <input
                          type="number"
                          className="input text-center font-bold h-9 flex-1 min-w-0"
                          value={set.team1Score}
                          onChange={(e) => updateSetScore(idx, 1, parseInt(e.target.value) || 0)}
                          min="0" max="30" inputMode="numeric"
                        />
                      </div>
                      <span className="text-border text-xs font-bold shrink-0">{common.vs}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="number"
                          className="input text-center font-bold h-9 flex-1 min-w-0"
                          value={set.team2Score}
                          onChange={(e) => updateSetScore(idx, 2, parseInt(e.target.value) || 0)}
                          min="0" max="30" inputMode="numeric"
                        />
                        <span className="text-xs font-semibold text-destructive shrink-0">{dict.team2}</span>
                      </div>
                      {sets.length > 1 && (
                        <button type="button" className="button small red shrink-0" onClick={() => setSets((p) => p.filter((_, i) => i !== idx))}>
                          <span className="icon"><i className="mdi mdi-delete"></i></span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className="button small light w-full mt-2" onClick={() => setSets((p) => [...p, { team1Score: 0, team2Score: 0 }])}>
                  {dict.addSet}
                </button>
              </div>

              <hr />

              <div className="field">
                <label className="label">{dict.date}</label>
                <div className="control">
                  <input type="date" className="input" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
                </div>
              </div>

              <hr className="my-4" />

              <div className="field grouped">
                <div className="control">
                  <button type="button" className="button green disabled:opacity-40 disabled:cursor-not-allowed" onClick={handleSave} disabled={saving || !isDirty}>
                    <span className="icon"><i className="mdi mdi-check"></i></span>
                    <span>{saving ? dict.saving : dict.submitGame}</span>
                  </button>
                </div>
                <div className="control">
                  <button type="button" className="button light" onClick={handleReset} disabled={!isDirty}>
                    <span className="icon"><i className="mdi mdi-restore"></i></span>
                    <span>{dict.reset}</span>
                  </button>
                </div>
                <div className="control">
                  <Link to={`/games/${id}`} className="button light">{common.cancel}</Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View card — always shown */}
        <div className="card mb-4 sm:mb-6">
          <header className="card-header">
            <p className="card-header-title">
              <span className="icon"><i className="mdi mdi-badminton"></i></span>
              {typeLabel(game.type)}
            </p>
            {!isEditing && (
              <Link to={`/games/${id}?edit=true`} className="card-header-icon">
                <span className="icon"><i className="mdi mdi-pencil"></i></span>
              </Link>
            )}
          </header>
          <div className="card-content">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">{dict.type}</p>
                  <p className="font-semibold">{typeLabel(game.type)}</p>
                </div>
                <div>
                  <p className="text-sm text-primary font-medium mb-1">{dict.team1}</p>
                  {game.team1Players?.map((p: any, i: number) => <div key={i} className="mb-0.5">{playerLine(p)}</div>)}
                </div>
                <div>
                  <p className="text-sm text-destructive font-medium mb-1">{dict.team2}</p>
                  {game.team2Players?.map((p: any, i: number) => <div key={i} className="mb-0.5">{playerLine(p)}</div>)}
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">{dict.winner}</p>
                  <p className="font-semibold">
                    {game.winner === "team1"
                      ? game.team1Players?.map((p: any) => p.profile?.name || p.email?.split("@")[0] || "?").join(" & ")
                      : game.winner === "team2"
                        ? game.team2Players?.map((p: any) => p.profile?.name || p.email?.split("@")[0] || "?").join(" & ")
                        : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{dict.result}</p>
                  <p>
                    <span className="font-bold" title={game.setsSummary}>{game.resultSummary}</span>
                    <span className={`ml-1 text-[10px] uppercase font-semibold px-1 rounded ${game.isQuickMode ? "bg-success/10 text-success" : "bg-accent/10 text-accent-foreground"}`}>
                      {game.isQuickMode ? dict.quickBadge : dict.setsBadge}
                    </span>
                  </p>
                  {!game.isQuickMode && game.sets?.length > 1 && (
                    <div className="mt-1.5 space-y-0.5">
                      {game.sets.map((s: any, i: number) => (
                        <div key={i} className="text-xs text-muted-foreground flex gap-2">
                          <span className="font-medium text-muted-foreground/80 w-8">{dict.set} {i + 1}</span>
                          <span className="tabular-nums">{s.team1Score} - {s.team2Score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{dict.date}</p>
                  <p className="text-muted-foreground text-sm">
                    {new Date(game.playedAt || game.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
