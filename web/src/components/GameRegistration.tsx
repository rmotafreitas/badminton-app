import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useGameService } from "@/di/container";
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

function ScoreInput({
  value,
  onChange,
  label,
  labelColor,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  labelColor: string;
}) {
  const btn = "flex-1 flex items-center justify-center text-2xl font-bold select-none rounded-lg active:scale-95 transition-transform";
  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
      <div className="flex items-stretch w-full rounded-lg border border-border overflow-hidden">
        <button
          type="button"
          className={`${btn} bg-secondary text-muted-foreground hover:bg-secondary/80`}
          onClick={() => onChange(Math.max(0, value - 1))}
          tabIndex={-1}
        >
          −
        </button>
        <input
          type="number"
          className="flex-1 w-0 min-w-0 text-center text-3xl font-bold tabular-nums bg-card border-none outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (!isNaN(v) && v >= 0 && v <= 30) onChange(v);
          }}
          min="0"
          max="30"
          inputMode="numeric"
        />
        <button
          type="button"
          className={`${btn} bg-secondary text-muted-foreground hover:bg-secondary/80`}
          onClick={() => onChange(Math.min(30, value + 1))}
          tabIndex={-1}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function GameRegistration({
  clubId,
  clubPlayers,
  onGameRegistered,
}: {
  clubId?: string;
  clubPlayers: any[];
  onGameRegistered?: () => void;
}) {
  const { user } = useAuth();
  const gameService = useGameService();
  const [gameType, setGameType] = useState<GameType>("SINGLES");
  const [team1Players, setTeam1Players] = useState<string[]>(() => {
    if (user?.roles?.includes("PLAYER") && user?.userId) return [user.userId];
    return [];
  });
  const [team2Players, setTeam2Players] = useState<string[]>([]);
  const [sets, setSets] = useState<GameSet[]>([{ team1Score: 0, team2Score: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const dict = useDictionary().games;
  const common = useDictionary().common;

  const playerLabels = {
    select: dict.selectPlayer,
    add: dict.addPlayer,
    search: dict.searchPlayers,
    noMatches: dict.noMatches,
    noAvailable: dict.noPlayersAvailable,
  };

  const maxPerSide = gameType === "SINGLES" ? 1 : 2;

  const players: Player[] = useMemo(
    () =>
      (clubPlayers || []).map((p: any) => ({
        id: p.id,
        name: p.profile?.name || p.email?.split("@")[0] || "?",
        photo: p.profile?.photo || null,
      })),
    [clubPlayers],
  );

  const allSelected = [...team1Players, ...team2Players];

  const sideALabel = gameType === "SINGLES" ? dict.playerLabel : dict.pairA;
  const sideBLabel = gameType === "SINGLES" ? dict.opponentLabel : dict.pairB;

  const updateSetScore = (setIndex: number, team: 1 | 2, score: number) => {
    setSets((prev) => {
      const newSets = [...prev];
      newSets[setIndex] = { ...newSets[setIndex], [`team${team}Score`]: score };
      return newSets;
    });
  };

  const addSet = () => setSets((prev) => [...prev, { team1Score: 0, team2Score: 0 }]);
  const removeSet = (index: number) => {
    if (sets.length > 1) setSets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!clubId) {
      setError(dict.noClubError);
      return;
    }

    if (team1Players.length !== maxPerSide || team2Players.length !== maxPerSide) {
      setError(dict.validationPlayers);
      return;
    }

    // Validate scores
    for (const s of sets) {
      if (s.team1Score === 0 && s.team2Score === 0) {
        setError(dict.scoreNotEntered || "Please enter scores for all sets.");
        return;
      }
      const errKey = checkScore(s.team1Score, s.team2Score);
      if (errKey) { setError((dict as any)[errKey] || errKey); return; }
    }

    try {
      setLoading(true);
      await gameService.registerGame({
        clubId,
        type: gameType,
        team1PlayerIds: team1Players,
        team2PlayerIds: team2Players,
        sets,
      });
      setSuccess(true);
      setSets([{ team1Score: 0, team2Score: 0 }]);
      if (!user?.roles?.includes("PLAYER")) setTeam1Players([]);
      setTeam2Players([]);
      onGameRegistered?.();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || dict.failedToRegister);
    } finally {
      setLoading(false);
    }
  };

  if (!clubId) {
    return (
      <div className="notification red">
        <div><span className="icon"><i className="mdi mdi-alert"></i></span>{dict.noClubError}</div>
      </div>
    );
  }

  return (
    <div className="card mb-6">
      <header className="card-header">
        <p className="card-header-title">
          <span className="icon"><i className="mdi mdi-badminton"></i></span>
          {dict.registerGame}
        </p>
      </header>
      <div className="card-content">
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="notification red mb-4">
              <div><span className="icon"><i className="mdi mdi-alert"></i></span>{error}</div>
            </div>
          )}
          {success && (
            <div className="notification green mb-4">
              <div><span className="icon"><i className="mdi mdi-check"></i></span>{dict.success}</div>
            </div>
          )}

          <div className="mb-4">
            <label className="label text-sm">{dict.type}</label>
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

          <hr />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <PlayerSelect
              label={sideALabel}
              labelColor="text-primary"
              available={players}
              selected={team1Players}
              max={maxPerSide}
              onChange={setTeam1Players}
              disabledIds={team2Players}
              color="blue"
              labels={playerLabels}
            />
            <PlayerSelect
              label={sideBLabel}
              labelColor="text-destructive"
              available={players}
              selected={team2Players}
              max={maxPerSide}
              onChange={setTeam2Players}
              disabledIds={team1Players}
              color="red"
              labels={playerLabels}
            />
          </div>

          {allSelected.length > 0 && (
            <div className="flex items-center justify-center gap-3 my-3 text-sm">
              <span className="font-semibold text-primary">
                {team1Players.map((id) => players.find((p) => p.id === id)?.name).join(" & ") || "—"}
              </span>
              <span className="text-muted-foreground/70 font-bold">{common.vs}</span>
              <span className="font-semibold text-destructive">
                {team2Players.map((id) => players.find((p) => p.id === id)?.name).join(" & ") || "—"}
              </span>
            </div>
          )}

          <hr />

          <div className="space-y-3 mb-4">
            {sets.map((set, idx) => (
              <div key={idx} className="bg-muted p-3 rounded border">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-8 shrink-0">{dict.set} {idx + 1}</span>
                  <ScoreInput
                    value={set.team1Score}
                    onChange={(v) => updateSetScore(idx, 1, v)}
                    label=""
                    labelColor="text-primary"
                  />
                  <span className="text-border text-sm font-bold shrink-0 pt-4">{common.vs}</span>
                  <ScoreInput
                    value={set.team2Score}
                    onChange={(v) => updateSetScore(idx, 2, v)}
                    label=""
                    labelColor="text-destructive"
                  />
                  {sets.length > 1 && (
                    <button type="button" className="button small red shrink-0" onClick={() => removeSet(idx)}>
                      <span className="icon"><i className="mdi mdi-delete"></i></span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" className="button small light w-full" onClick={addSet}>
              {dict.addSet}
            </button>
          </div>

          <div className="field grouped">
            <div className="control w-full sm:w-auto">
              <button type="submit" className="button blue w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed" disabled={loading}>
                <span className="icon"><i className="mdi mdi-check"></i></span>
                <span>{loading ? dict.saving : dict.submitGame}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
