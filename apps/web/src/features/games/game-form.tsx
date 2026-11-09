import type { ClubMember, Game, GameType } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { clubQuery } from "@/features/clubs";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { tick } from "@/shared/lib/haptics";
import { cn } from "@/shared/lib/utils";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { invalidateAfterGame, myGamesQuery, registerGame, rememberGame, updateGame } from "./api";
import { frequentPartners, PlayerSheet } from "./player-sheet";
import { checkScore, type ScoreError } from "./score";
import { ScorePicker } from "./score-picker";

type SetScore = { a: number | null; b: number | null };
type Slot = { team: "team1" | "team2"; index: number };

interface FormState {
  type: GameType;
  team1: (string | null)[];
  team2: (string | null)[];
  /** One row = a single game entered as points; more rows = sets. No mode to choose. */
  sets: SetScore[];
  /** null = just now. */
  playedAt: string | null;
}

const toLocalInput = (iso: string | Date) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const resize = (team: (string | null)[], size: number) => Array.from({ length: size }, (_, i) => team[i] ?? null);

export interface GameDraft {
  type?: GameType;
  team1?: string[];
  team2?: string[];
  sets?: { a: number; b: number }[];
}

function initialState(game: Game | undefined, viewerId: string, selfDefault: boolean, draft?: GameDraft): FormState {
  if (game) {
    return {
      type: game.type,
      team1: game.team1Players.map((p) => p.id),
      team2: game.team2Players.map((p) => p.id),
      sets: game.sets.map((s) => ({ a: s.team1Score, b: s.team2Score })),
      playedAt: toLocalInput(game.playedAt),
    };
  }
  const type = draft?.type ?? "SINGLES";
  const size = type === "SINGLES" ? 1 : 2;
  return {
    type,
    team1: resize(draft?.team1 ?? [selfDefault ? viewerId : null], size),
    team2: resize(draft?.team2 ?? [], size),
    sets: draft?.sets?.length ? draft.sets : [{ a: null, b: null }],
    playedAt: null,
  };
}

/** A big player slot: avatar and name, or "Add player". */
function SlotButton({ member, label, invalid, onClick }: { member: ClubMember | undefined; label: string; invalid: boolean; onClick: () => void }) {
  const dict = useDictionary().ui;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "tap-target flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left transition active:scale-[0.99]",
        invalid && "border-destructive",
        !member && "border-dashed text-muted-foreground",
      )}
    >
      {member ? (
        <>
          <PlayerAvatar id={member.id} name={member.name} photoUrl={member.photoUrl} className="size-9" />
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">{member.name || member.email || dict.common.unknownPlayer}</span>
        </>
      ) : (
        <>
          <span className="flex size-9 items-center justify-center rounded-full bg-muted">
            <UserPlus className="size-4" />
          </span>
          <span className="flex-1">{dict.games.addPlayer}</span>
        </>
      )}
    </button>
  );
}

/** A big tappable score: opens the one-tap picker. */
function ScoreButton({ value, label, invalid, onClick, highlight }: { value: number | null; label: string; invalid: boolean; onClick: () => void; highlight: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "tap-target tabular flex h-16 flex-1 items-center justify-center rounded-2xl border text-3xl font-bold transition active:scale-95",
        value === null ? "border-dashed text-muted-foreground" : highlight ? "border-primary bg-primary/10 text-primary" : "bg-card",
        invalid && "border-destructive",
      )}
    >
      {value ?? "–"}
    </button>
  );
}

function GameFormBody({
  members,
  clubId,
  game,
  viewerId,
  selfDefault,
  draft,
  onDone,
  onPending,
}: {
  members: ClubMember[];
  clubId: string;
  game?: Game;
  viewerId: string;
  selfDefault: boolean;
  draft?: GameDraft;
  onDone: (game: Game) => void;
  onPending: (pending: boolean) => void;
}) {
  const dict = useDictionary().ui;
  const t = dict.games;
  const { api, queryClient } = useAppContext();
  const [state, setState] = useState<FormState>(() => initialState(game, viewerId, selfDefault, draft));
  const [showErrors, setShowErrors] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [picking, setPicking] = useState<{ row: number; side: "a" | "b" } | null>(null);
  const update = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));
  const myGames = useQuery(myGamesQuery(api));
  const recentIds = useMemo(() => frequentPartners(myGames.data ?? [], viewerId), [myGames.data, viewerId]);
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const taken = useMemo(() => new Set([...state.team1, ...state.team2].filter((id): id is string => !!id)), [state.team1, state.team2]);
  const setErrors: (ScoreError | "empty" | null)[] = state.sets.map((s) => (s.a === null || s.b === null ? "empty" : checkScore(s.a, s.b)));
  const playersMissing = [...state.team1, ...state.team2].some((id) => !id);
  const problem = playersMissing
    ? t.pickAllPlayers
    : setErrors.includes("empty")
      ? t.fillScores
      : (() => {
          const err = setErrors.find((e): e is ScoreError => !!e && e !== "empty");
          return err ? t.scoreErrors[err] : null;
        })();
  const rowLabel = (i: number) => (state.sets.length === 1 ? t.score : fmt(t.set, { n: i + 1 }));
  const teamLabel = (team: "team1" | "team2") => (team === "team1" ? t.team1 : t.team2);

  const save = useMutation({
    mutationFn: () => {
      const sets = state.sets.map((s) => ({ team1Score: s.a ?? 0, team2Score: s.b ?? 0 }));
      const lineup = {
        type: state.type,
        team1PlayerIds: state.team1 as string[],
        team2PlayerIds: state.team2 as string[],
        playedAt: new Date(state.playedAt ?? Date.now()).toISOString(),
      };
      if (game) return updateGame(api, game.id, { ...lineup, sets });
      return sets.length === 1
        ? registerGame(api, { clubId, ...lineup, team1Points: sets[0]!.team1Score, team2Points: sets[0]!.team2Score })
        : registerGame(api, { clubId, ...lineup, sets });
    },
    onSuccess: (saved) => {
      tick([10, 40, 10]);
      toast.success(t.saved);
      // The answer is the saved game: show it everywhere now, refresh ratings and the rest in the background.
      rememberGame(queryClient, saved, { isNew: !game, viewerId });
      void invalidateAfterGame(queryClient);
      onDone(saved);
    },
  });

  useEffect(() => onPending(save.isPending), [save.isPending, onPending]);

  const submit = () => {
    setShowErrors(true);
    if (!problem) save.mutate();
  };

  const pickScore = (score: number) => {
    if (!picking) return;
    const { row, side } = picking;
    const sets = state.sets.map((s, i) => (i === row ? { ...s, [side]: score } : s));
    update({ sets });
    // Straight on to the other team's score if it's still empty.
    const other = side === "a" ? "b" : "a";
    setPicking(sets[row]![other] === null ? { row, side: other } : null);
  };

  const team = (side: "team1" | "team2") => (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{teamLabel(side)}</p>
      {state[side].map((id, i) => (
        <SlotButton
          key={`${side}-${i}`}
          member={id ? byId.get(id) : undefined}
          label={`${teamLabel(side)} ${i + 1}`}
          invalid={showErrors && !id}
          onClick={() => setSlot({ team: side, index: i })}
        />
      ))}
    </div>
  );

  return (
    <form
      id="game-form"
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div role="radiogroup" aria-label={t.type} className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
        {(["SINGLES", "DOUBLES"] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={state.type === type}
            onClick={() => {
              const size = type === "SINGLES" ? 1 : 2;
              update({ type, team1: resize(state.team1, size), team2: resize(state.team2, size) });
            }}
            className={cn(
              "tap-target h-12 rounded-xl text-sm font-semibold transition",
              state.type === type ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {type === "SINGLES" ? dict.common.singles : dict.common.doubles}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {team("team1")}
        {team("team2")}
      </div>

      <div className="space-y-3">
        {state.sets.map((s, i) => {
          const err = showErrors ? setErrors[i] : null;
          const winner = s.a !== null && s.b !== null && !checkScore(s.a, s.b) ? (s.a > s.b ? "a" : "b") : null;
          return (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>{rowLabel(i)}</span>
                {state.sets.length > 1 && (
                  <button
                    type="button"
                    aria-label={`${t.removeSet} ${i + 1}`}
                    onClick={() => update({ sets: state.sets.filter((_, j) => j !== i) })}
                    className="tap-target -m-2 flex items-center gap-1 p-2"
                  >
                    <X className="size-3.5" /> {t.removeSet}
                  </button>
                )}
              </div>
              {/* Which box is whose, under the first row's title and lined up with the boxes. */}
              {i === 0 && (
                <div className="flex gap-2 text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  <span className="flex-1">{t.team1}</span>
                  <span aria-hidden="true" className="invisible">
                    –
                  </span>
                  <span className="flex-1">{t.team2}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <ScoreButton
                  value={s.a}
                  label={`${t.team1} ${rowLabel(i)}`}
                  invalid={!!err}
                  highlight={winner === "a"}
                  onClick={() => setPicking({ row: i, side: "a" })}
                />
                <span className="text-muted-foreground">–</span>
                <ScoreButton
                  value={s.b}
                  label={`${t.team2} ${rowLabel(i)}`}
                  invalid={!!err}
                  highlight={winner === "b"}
                  onClick={() => setPicking({ row: i, side: "b" })}
                />
              </div>
            </div>
          );
        })}
        {state.sets.length < 3 && (
          <Button type="button" variant="ghost" className="h-11 w-full" onClick={() => update({ sets: [...state.sets, { a: null, b: null }] })}>
            <Plus /> {t.addSet}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t.playedAt}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={state.playedAt === null ? "default" : "outline"} className="h-11 rounded-full" onClick={() => update({ playedAt: null })}>
            {t.now}
          </Button>
          <Button
            type="button"
            variant={state.playedAt !== null ? "default" : "outline"}
            className="h-11 rounded-full"
            onClick={() => update({ playedAt: state.playedAt ?? toLocalInput(new Date(Date.now() - 3_600_000)) })}
          >
            {t.earlier}
          </Button>
        </div>
        {state.playedAt !== null && (
          <Input
            aria-label={t.playedAt}
            type="datetime-local"
            className="h-11"
            value={state.playedAt}
            max={toLocalInput(new Date())}
            onChange={(e) => update({ playedAt: e.target.value || null })}
          />
        )}
      </div>

      {(showErrors && problem) || save.error ? (
        <Alert variant="destructive">
          <AlertDescription>{showErrors && problem ? problem : save.error?.message}</AlertDescription>
        </Alert>
      ) : null}

      <PlayerSheet
        open={slot !== null}
        onOpenChange={(open) => !open && setSlot(null)}
        title={slot ? `${teamLabel(slot.team)} ${slot.index + 1}` : ""}
        members={members}
        value={slot ? state[slot.team][slot.index] ?? null : null}
        taken={taken}
        recentIds={recentIds}
        onPick={(id) => {
          if (!slot) return;
          update({ [slot.team]: state[slot.team].map((v, j) => (j === slot.index ? id : v)) } as Partial<FormState>);
          setSlot(null);
        }}
      />
      <ScorePicker
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        title={
          picking
            ? fmt(t.scoreOf, { team: picking.side === "a" ? t.team1 : t.team2 }) +
              (state.sets.length > 1 ? ` · ${rowLabel(picking.row)}` : "")
            : ""
        }
        value={picking ? state.sets[picking.row]![picking.side] : null}
        other={picking ? state.sets[picking.row]![picking.side === "a" ? "b" : "a"] : null}
        onPick={pickScore}
      />
    </form>
  );
}

/** Register (no `game`) or edit a game. Players come from the club's roster. */
export function GameFormDialog({
  open,
  onOpenChange,
  clubId,
  game,
  viewerId,
  selfDefault,
  draft,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  game?: Game;
  viewerId: string;
  /** Players register their own games: they start on team 1. */
  selfDefault: boolean;
  /** Pre-filled lineup and scores (from the live score keeper). */
  draft?: GameDraft;
  onSaved?: (game: Game) => void;
}) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const club = useQuery({ ...clubQuery(api, clubId), enabled: open });
  const [pending, setPending] = useState(false);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={game ? dict.games.editTitle : dict.games.registerTitle}
      description={dict.games.registerHint}
      footer={
        club.data ? (
          <Button type="submit" form="game-form" className="h-12 w-full text-base" disabled={pending}>
            {pending && <Spinner />} {dict.common.save}
          </Button>
        ) : undefined
      }
    >
      {club.data ? (
        <GameFormBody
          key={game?.id ?? "new"}
          members={club.data.members}
          clubId={clubId}
          game={game}
          viewerId={viewerId}
          selfDefault={selfDefault}
          draft={draft}
          onPending={setPending}
          onDone={(saved) => {
            onOpenChange(false);
            onSaved?.(saved);
          }}
        />
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="h-16" />
        </div>
      )}
    </ResponsiveSheet>
  );
}

