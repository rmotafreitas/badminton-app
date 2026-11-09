import type { ClubMember, GameType, SessionUser } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftRight, MoreVertical, RotateCcw, Trash2, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { clubQuery } from "@/features/clubs";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { tick } from "@/shared/lib/haptics";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { myGamesQuery } from "./api";
import { GameFormDialog } from "./game-form";
import { frequentPartners, PlayerSheet } from "./player-sheet";
import { type LiveMatch, newMatch, point, replay, type Side, undo } from "./scoring";

interface Saved {
  readonly match: LiveMatch;
  readonly type: GameType;
  readonly team1: (string | null)[];
  readonly team2: (string | null)[];
  /** Team 1 plays the top half (after changing ends). */
  readonly swapped: boolean;
  readonly started: boolean;
}

const storageKey = (userId: string) => `bb:live-score:v1:${userId}`;

/** The match in progress survives a locked phone, a reload or the app being killed. */
function load(userId: string): Saved | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function persist(userId: string, saved: Saved | null) {
  try {
    if (saved) localStorage.setItem(storageKey(userId), JSON.stringify(saved));
    else localStorage.removeItem(storageKey(userId));
  } catch {
    // private mode: the match just won't survive a reload
  }
}

/** Keeps the screen on while scoring (re-acquired when the app comes back to the foreground). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // battery saver, unsupported
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

const firstName = (m: ClubMember | undefined) => (m?.name ?? "").split(" ")[0] || null;

function TeamHalf({
  side,
  label,
  players,
  score,
  games,
  serving,
  court,
  mine,
  disabled,
  onPoint,
}: {
  side: Side;
  label: string;
  players: (ClubMember | undefined)[];
  score: number;
  games: number;
  serving: boolean;
  court: "right" | "left";
  mine: boolean;
  disabled: boolean;
  onPoint: (side: Side) => void;
}) {
  const t = useDictionary().ui.live;
  return (
    <button
      type="button"
      aria-label={fmt(t.pointFor, { team: label })}
      disabled={disabled}
      onClick={() => onPoint(side)}
      className={cn(
        "tap-target relative flex flex-1 flex-col items-center justify-center gap-2 overflow-hidden px-4 transition-colors active:brightness-95 disabled:opacity-100",
        mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        {players.filter(Boolean).map((p) => (
          <PlayerAvatar key={p!.id} id={p!.id} name={p!.name} photoUrl={p!.photoUrl} className="size-8 ring-2 ring-background/40" />
        ))}
        <span className="max-w-[60vw] truncate text-lg font-semibold">{label}</span>
      </div>
      <span className="tabular text-[min(34vw,11rem)] leading-none font-black tracking-tighter" aria-live="polite">
        {score}
      </span>
      <div className="flex items-center gap-3 text-sm font-medium opacity-90">
        <span className="flex gap-1" aria-label={fmt(t.gamesWon, { n: games })}>
          {Array.from({ length: 2 }, (_, i) => (
            <span key={i} className={cn("size-2.5 rounded-full border-2 border-current", i < games && "bg-current")} />
          ))}
        </span>
        {serving && (
          <span className="rounded-full bg-background/20 px-2.5 py-0.5">
            {t.serving} · {court === "right" ? t.right : t.left}
          </span>
        )}
      </div>
    </button>
  );
}

export function LiveScorePage({ user }: { user: SessionUser }) {
  const dict = useDictionary().ui;
  const t = dict.live;
  const navigate = useNavigate();
  const { api } = useAppContext();
  const club = useQuery({ ...clubQuery(api, user.clubId ?? ""), enabled: !!user.clubId });
  const myGames = useQuery(myGamesQuery(api));
  const members = club.data?.members ?? [];
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const recentIds = useMemo(() => frequentPartners(myGames.data ?? [], user.id), [myGames.data, user.id]);
  const [saved, setSaved] = useState<Saved>(
    () => load(user.id) ?? { match: newMatch(1), type: "SINGLES", team1: [user.id], team2: [null], swapped: false, started: false },
  );
  const [slot, setSlot] = useState<{ team: "team1" | "team2"; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [ackGames, setAckGames] = useState(0);
  const state = replay(saved.match);
  const lastChangeEnds = useRef(false);
  useWakeLock();

  useEffect(() => persist(user.id, saved), [user.id, saved]);

  // Deciding game, leader reaches 11: change ends (and the halves swap so each team keeps its own side of the phone).
  useEffect(() => {
    if (state.changeEnds && !lastChangeEnds.current) {
      tick([60, 80, 60]);
      toast(t.changeEnds);
    }
    lastChangeEnds.current = state.changeEnds;
  }, [state.changeEnds, t.changeEnds]);

  const label = (team: "team1" | "team2") => {
    const names = saved[team].map((id) => firstName(id ? byId.get(id) : undefined)).filter(Boolean);
    return names.length ? names.join(" & ") : team === "team1" ? dict.games.team1 : dict.games.team2;
  };

  const onPoint = (side: Side) => {
    tick();
    setSaved((s) => ({ ...s, match: point(s.match, side) }));
  };

  const exit = () => void navigate({ to: "/games" });
  const discard = () => {
    persist(user.id, null);
    setSaved({ match: newMatch(1), type: saved.type, team1: saved.team1, team2: saved.team2, swapped: false, started: false });
    setAckGames(0);
  };

  // ── Setup: who plays, who serves first ─────────────────────────────────────────────────────────────────────
  if (!saved.started) {
    const slotButton = (team: "team1" | "team2", index: number) => {
      const id = saved[team][index];
      const m = id ? byId.get(id) : undefined;
      return (
        <button
          key={`${team}-${index}`}
          type="button"
          aria-label={`${team === "team1" ? t.yourTeam : t.opponents} ${index + 1}`}
          onClick={() => setSlot({ team, index })}
          className={cn("tap-target flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 text-left", !m && "border-dashed text-muted-foreground")}
        >
          {m ? <PlayerAvatar id={m.id} name={m.name} photoUrl={m.photoUrl} className="size-9" /> : <span className="size-9 rounded-full bg-muted" />}
          <span className="truncate font-medium">{m ? m.name : dict.games.addPlayer}</span>
        </button>
      );
    };
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background pt-safe pb-safe px-safe">
        <div className="flex h-14 items-center gap-2 px-2">
          <Button variant="ghost" size="icon" className="size-11" aria-label={dict.common.close} onClick={exit}>
            <X className="size-6" />
          </Button>
          <h1 className="text-lg font-semibold">{dict.games.keepScore}</h1>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
          <p className="text-sm text-muted-foreground">{t.setupHint}</p>
          <div role="radiogroup" aria-label={dict.games.type} className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
            {(["SINGLES", "DOUBLES"] as const).map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={saved.type === type}
                onClick={() => {
                  const size = type === "SINGLES" ? 1 : 2;
                  const fit = (team: (string | null)[]) => Array.from({ length: size }, (_, i) => team[i] ?? null);
                  setSaved((s) => ({ ...s, type, team1: fit(s.team1), team2: fit(s.team2) }));
                }}
                className={cn("tap-target h-12 rounded-xl text-sm font-semibold", saved.type === type ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {type === "SINGLES" ? dict.common.singles : dict.common.doubles}
              </button>
            ))}
          </div>
          {(["team1", "team2"] as const).map((team) => (
            <div key={team} className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{team === "team1" ? t.yourTeam : t.opponents}</p>
              {saved[team].map((_, i) => slotButton(team, i))}
            </div>
          ))}
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.firstServe}</p>
            <div role="radiogroup" aria-label={t.firstServe} className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  role="radio"
                  aria-checked={saved.match.firstServer === side}
                  onClick={() => setSaved((s) => ({ ...s, match: newMatch(side) }))}
                  className={cn(
                    "tap-target h-12 truncate rounded-xl border px-3 text-sm font-semibold",
                    saved.match.firstServer === side ? "border-primary bg-primary/10 text-primary" : "bg-card",
                  )}
                >
                  {label(side === 1 ? "team1" : "team2")}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t p-4">
          <Button className="h-14 w-full text-lg" onClick={() => setSaved((s) => ({ ...s, started: true }))}>
            {t.start}
          </Button>
        </div>
        <PlayerSheet
          open={slot !== null}
          onOpenChange={(open) => !open && setSlot(null)}
          title={slot ? `${slot.team === "team1" ? t.yourTeam : t.opponents} ${slot.index + 1}` : ""}
          members={members}
          value={slot ? saved[slot.team][slot.index] ?? null : null}
          taken={new Set([...saved.team1, ...saved.team2].filter((id): id is string => !!id))}
          recentIds={recentIds}
          onPick={(id) => {
            if (!slot) return;
            setSaved((s) => ({ ...s, [slot.team]: s[slot.team].map((v, j) => (j === slot.index ? id : v)) }));
            setSlot(null);
          }}
        />
      </div>
    );
  }

  // ── Scoreboard ─────────────────────────────────────────────────────────────────────────────────────────────
  const gameJustEnded = state.gameOver && !state.matchWinner && state.games.length > ackGames;
  const halves = (["team2", "team1"] as const).map((team) => {
    const side: Side = team === "team1" ? 1 : 2;
    return (
      <TeamHalf
        key={team}
        side={side}
        label={label(team)}
        players={saved[team].map((id) => (id ? byId.get(id) : undefined))}
        score={side === 1 ? state.current.a : state.current.b}
        games={side === 1 ? state.gamesWon.a : state.gamesWon.b}
        serving={!state.gameOver && state.server === side}
        court={state.serviceCourt}
        mine={team === "team1"}
        disabled={!!state.matchWinner || gameJustEnded}
        onPoint={onPoint}
      />
    );
  });
  const [top, bottom] = saved.swapped ? [halves[1], halves[0]] : [halves[0], halves[1]];
  const draft = {
    type: saved.type,
    team1: saved.team1.filter((id): id is string => !!id),
    team2: saved.team2.filter((id): id is string => !!id),
    sets: (state.gameOver ? state.games : [...state.games, state.current]).map((g) => ({ a: g.a, b: g.b })),
  };
  const lastGame = state.games.at(-1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overscroll-none bg-background pt-safe pb-safe px-safe select-none">
      <div className="flex h-14 shrink-0 items-center gap-2 px-2">
        <Button variant="ghost" size="icon" className="size-11" aria-label={dict.common.close} onClick={exit}>
          <X className="size-6" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-sm font-semibold">{fmt(t.gameN, { n: state.gameNumber })}</div>
          {state.games.length > 0 && (
            <div className="tabular text-xs text-muted-foreground">{state.games.map((g) => `${g.a}–${g.b}`).join(" · ")}</div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label={t.menu}>
              <MoreVertical className="size-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem className="h-11" onSelect={() => setSaved((s) => ({ ...s, swapped: !s.swapped }))}>
              <ArrowLeftRight /> {t.swapSides}
            </DropdownMenuItem>
            <DropdownMenuItem className="h-11" onSelect={() => setSaving(true)}>
              <Trophy /> {t.finishNow}
            </DropdownMenuItem>
            <DropdownMenuItem className="h-11" variant="destructive" onSelect={discard}>
              <Trash2 /> {t.discard}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-1">
        {top}
        {bottom}

        {(gameJustEnded || state.matchWinner) && (
          <div className="absolute inset-0 flex items-end bg-background/70 p-4 backdrop-blur-sm">
            <div role="alertdialog" aria-label={state.matchWinner ? t.matchOver : t.gameOver} className="w-full space-y-4 rounded-3xl border bg-card p-5 shadow-xl">
              <div className="space-y-1 text-center">
                <Trophy className="mx-auto size-8 text-gold-foreground dark:text-gold" />
                <p className="text-xl font-bold">
                  {state.matchWinner
                    ? fmt(t.wins, { team: label(state.matchWinner === 1 ? "team1" : "team2"), score: `${state.gamesWon.a}–${state.gamesWon.b}` })
                    : fmt(t.gameTo, { n: state.games.length, team: label(lastGame && lastGame.a > lastGame.b ? "team1" : "team2") })}
                </p>
                <p className="tabular text-muted-foreground">{state.games.map((g) => `${g.a}–${g.b}`).join(" · ")}</p>
              </div>
              <div className="grid gap-2">
                {!state.matchWinner && (
                  <Button className="h-14 text-lg" onClick={() => setAckGames(state.games.length)}>
                    {t.nextGame}
                  </Button>
                )}
                <Button variant={state.matchWinner ? "default" : "outline"} className="h-14 text-lg" onClick={() => setSaving(true)}>
                  {t.saveGame}
                </Button>
                <Button variant="ghost" className="h-12" onClick={() => setSaved((s) => ({ ...s, match: undo(s.match) }))}>
                  <RotateCcw /> {t.undoLast}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-[1fr_auto] gap-2 p-3">
        <Button
          variant="outline"
          className="h-14 text-base"
          disabled={saved.match.rallies.length === 0}
          onClick={() => {
            tick(30);
            setSaved((s) => ({ ...s, match: undo(s.match) }));
          }}
        >
          <RotateCcw className="size-5" /> {t.undo}
        </Button>
        <Button variant="secondary" className="h-14 px-5 text-base" onClick={() => setSaving(true)} disabled={saved.match.rallies.length === 0}>
          {t.finish}
        </Button>
      </div>

      {user.clubId && (
        <GameFormDialog
          open={saving}
          onOpenChange={setSaving}
          clubId={user.clubId}
          viewerId={user.id}
          selfDefault
          draft={draft}
          onSaved={(game) => {
            persist(user.id, null);
            void navigate({ to: "/games/$gameId", params: { gameId: game.id }, replace: true });
          }}
        />
      )}
    </div>
  );
}
