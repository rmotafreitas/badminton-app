import type { SessionUser } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, Flame, MapPin, Plus, Swords, Trophy, Users } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useAppContext } from "@/app/context";
import { isStaff } from "@/features/auth";
import { clubQuery } from "@/features/clubs";
import { InstallCard } from "@/features/install";
import { clubGamesQuery, FormDots, GameFormDialog, GameRow, myGamesQuery, playerStats } from "@/features/games";
import { trainingReviewsQuery } from "@/features/training";
import { Page, PageHeader } from "@/shared/components/page-header";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { localDay } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Skeleton } from "@/shared/ui/skeleton";

function greeting(dict: ReturnType<typeof useDictionary>["ui"]["dashboard"]) {
  const h = new Date().getHours();
  return h < 12 ? dict.morning : h < 19 ? dict.afternoon : dict.evening;
}

function StatCard({ label, value, hint, icon, accent, loading }: { label: string; value: ReactNode; hint?: ReactNode; icon: ReactNode; accent?: string; loading?: boolean }) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardDescription className="flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <span className={cn("flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4", accent)}>{icon}</span>
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 px-5">
        {loading ? <Skeleton className="h-8 w-20" /> : <div className="tabular text-3xl font-semibold tracking-tight">{value}</div>}
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function RecentGames({ user, clubId, onRegister }: { user: SessionUser; clubId: string; onRegister: () => void }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const games = useQuery(clubGamesQuery(api, clubId));
  return (
    <Card className="gap-2 lg:col-span-2">
      <CardHeader>
        <CardTitle>{dict.dashboard.recentGames}</CardTitle>
        <CardDescription>{dict.dashboard.recentGamesHint}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/games">
              {dict.common.seeAll} <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-3">
        {games.isPending ? (
          <div className="space-y-2 px-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : games.data?.length ? (
          <div className="divide-y">
            {games.data.slice(0, 6).map((g) => (
              <GameRow key={g.id} game={g} viewerId={user.id} />
            ))}
          </div>
        ) : (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trophy />
              </EmptyMedia>
              <EmptyTitle>{dict.dashboard.noGames}</EmptyTitle>
              <EmptyDescription>{dict.dashboard.noGamesHint}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={onRegister}>
                <Plus /> {dict.games.register}
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function ClubCard({ clubId, viewerId }: { clubId: string; viewerId: string }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const club = useQuery(clubQuery(api, clubId));
  const top = useMemo(() => [...(club.data?.members ?? [])].sort((a, b) => b.eloSingles - a.eloSingles).slice(0, 5), [club.data]);
  if (!club.data) return <Skeleton className="h-80 rounded-xl" />;
  return (
    <Card className="gap-0 overflow-hidden pt-0">
      <div className="relative h-24 bg-gradient-to-br from-primary/80 to-primary">
        {club.data.bannerUrl && <img src={club.data.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />}
      </div>
      <CardHeader className="pb-4">
        <div className="flex items-end gap-3">
          <PlayerAvatar id={club.data.id} name={club.data.name} photoUrl={club.data.pictureUrl} className="-mt-8 size-16 rounded-xl ring-4 ring-card" />
          <div className="min-w-0 pt-3">
            <CardTitle className="truncate">{club.data.name}</CardTitle>
            <CardDescription className="flex items-center gap-3 text-xs">
              {club.data.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" /> {club.data.location}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="size-3" /> {fmt(dict.dashboard.membersCount, { n: club.data.members.length })}
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{dict.dashboard.topPlayers}</p>
        <ol className="space-y-1">
          {top.map((m, i) => (
            <li key={m.id}>
              <Link
                to="/profile/$userId"
                params={{ userId: m.id }}
                className={cn("flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60", m.id === viewerId && "bg-primary/5")}
              >
                <span className={cn("tabular w-4 text-center text-xs font-semibold text-muted-foreground", i === 0 && "text-gold-foreground dark:text-gold")}>{i + 1}</span>
                <PlayerAvatar id={m.id} name={m.name} photoUrl={m.photoUrl} className="size-7" />
                <span className="flex-1 truncate">{m.name || m.email}</span>
                <span className="tabular font-semibold">{Math.round(m.eloSingles)}</span>
              </Link>
            </li>
          ))}
        </ol>
        <Button variant="outline" size="sm" className="mt-2 w-full" asChild>
          <Link to="/users">{dict.nav.members}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TrainingCard() {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const reviews = useQuery(trainingReviewsQuery(api));
  const week = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const from = localDay(start);
    return (reviews.data ?? []).filter((r) => r.date >= from);
  }, [reviews.data]);
  const days = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = localDay(d);
      return { key, label: d.toLocaleDateString(undefined, { weekday: "narrow" }), effort: week.find((r) => r.date === key)?.effort ?? 0 };
    });
  }, [week]);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{dict.dashboard.trainingThisWeek}</CardTitle>
        <CardDescription>{fmt(dict.dashboard.sessionsLogged, { n: week.length })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-1.5">
          {days.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-16 w-full items-end overflow-hidden rounded-md bg-muted">
                <div className="w-full rounded-md bg-primary transition-all" style={{ height: `${d.effort * 10}%`, opacity: 0.35 + d.effort / 15 }} />
              </div>
              <span className="text-[11px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link to="/training-review">
            <CalendarCheck /> {dict.dashboard.logTraining}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function DashboardPage({ user }: { user: SessionUser }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const [registering, setRegistering] = useState(false);
  const myGames = useQuery(myGamesQuery(api));
  const stats = useMemo(() => (myGames.data ? playerStats(myGames.data, user.id) : null), [myGames.data, user.id]);
  const firstName = (user.name ?? "").split(" ")[0];

  return (
    <Page>
      <PageHeader
        title={`${greeting(dict.dashboard)}${firstName ? `, ${firstName}` : ""}`}
        description={dict.dashboard.subtitle}
      />

      <InstallCard />

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard label={dict.dashboard.singlesRating} value={Math.round(user.eloSingles)} icon={<Trophy />} accent="bg-gold/20 text-gold-foreground dark:text-gold" />
        <StatCard label={dict.dashboard.doublesRating} value={Math.round(user.eloDoubles)} icon={<Users />} />
        <StatCard
          label={dict.dashboard.played}
          value={stats?.total ?? 0}
          loading={!stats}
          hint={stats ? `${stats.wins}W · ${stats.losses}L · ${stats.winRate}%` : undefined}
          icon={<Swords />}
        />
        <StatCard
          label={dict.dashboard.streak}
          loading={!stats}
          value={
            stats?.streak ? (
              <span className={stats.streak.kind === "W" ? "text-win" : "text-loss"}>
                {stats.streak.count}
                {stats.streak.kind}
              </span>
            ) : (
              dict.dashboard.noStreak
            )
          }
          hint={stats && stats.form.length > 0 ? <FormDots form={stats.form.slice(0, 5)} /> : undefined}
          icon={<Flame />}
        />
      </div>

      {user.clubId ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <RecentGames user={user} clubId={user.clubId} onRegister={() => setRegistering(true)} />
          <div className="space-y-4">
            <ClubCard clubId={user.clubId} viewerId={user.id} />
            <TrainingCard />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Empty className="border lg:col-span-2">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>{dict.dashboard.noClubTitle}</EmptyTitle>
              <EmptyDescription>{dict.dashboard.noClubBody}</EmptyDescription>
            </EmptyHeader>
          </Empty>
          <TrainingCard />
        </div>
      )}

      {user.clubId && (
        <GameFormDialog open={registering} onOpenChange={setRegistering} clubId={user.clubId} viewerId={user.id} selfDefault={!isStaff(user)} />
      )}
    </Page>
  );
}
