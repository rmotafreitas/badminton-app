import type { Profile, SessionUser } from "@bb/contracts";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Mail, Pencil, Phone, Swords, Trophy } from "lucide-react";
import { lazy, type ReactNode, Suspense, useMemo, useState } from "react";
import { useAppContext } from "@/app/context";
import { FormDots, GameRow, myGamesQuery, playerGamesQuery, playerStats, ratingHistoryQuery, sharedGamesQuery } from "@/features/games";
import { ProfileRallyCard } from "@/features/rally";
import { Page } from "@/shared/components/page-header";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { formatDate } from "@/shared/lib/format";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Progress } from "@/shared/ui/progress";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { profileQuery } from "@/features/profiles/api";
import { EditProfileDialog } from "./edit-profile-dialog";

// The chart library is the heaviest thing on this page: header, stats and games paint first, charts stream in.
const RatingChart = lazy(() => import("./charts").then((m) => ({ default: m.RatingChart })));
const MonthlyChart = lazy(() => import("./charts").then((m) => ({ default: m.MonthlyChart })));

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Header({ profile, isMe, onEdit }: { profile: Profile; isMe: boolean; onEdit: () => void }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="relative h-36 bg-[linear-gradient(135deg,oklch(0.62_0.16_150),oklch(0.45_0.12_158))] md:h-48">
        {profile.bannerUrl && <img src={profile.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />}
      </div>
      <CardContent className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end">
        <PlayerAvatar id={profile.userId} name={profile.name} photoUrl={profile.photoUrl} className="-mt-14 size-28 text-2xl ring-4 ring-card md:size-32" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{profile.name || dict.common.unknownPlayer}</h1>
            {profile.roles
              .filter((r) => r !== "PLAYER")
              .map((r) => (
                <Badge key={r} className="bg-primary/12 text-primary hover:bg-primary/12">
                  {dict.roles[r]}
                </Badge>
              ))}
          </div>
          {profile.bio && <p className="max-w-2xl text-muted-foreground">{profile.bio}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" /> {fmt(dict.profile.memberSince, { date: formatDate(profile.memberSince, lang, { month: "long", year: "numeric" }) })}
            </span>
            {profile.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-4" /> {profile.email}
              </span>
            )}
            {profile.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-4" /> {profile.phone}
              </span>
            )}
          </div>
        </div>
        {isMe && (
          <Button variant="outline" onClick={onEdit}>
            <Pencil /> {dict.profile.edit}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfilePage({ userId, viewer }: { userId: string; viewer: SessionUser }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const isMe = userId === viewer.id;
  const profile = useQuery(profileQuery(api, userId));
  // Own games and someone else's are different caches (and the own list is persisted).
  const mine = useQuery({ ...myGamesQuery(api), enabled: isMe });
  const theirs = useQuery({ ...playerGamesQuery(api, userId), enabled: !isMe });
  const games = isMe ? mine : theirs;
  const history = useQuery(ratingHistoryQuery(api, userId));
  const shared = useQuery({ ...sharedGamesQuery(api, userId), enabled: !isMe });
  const stats = useMemo(() => (games.data ? playerStats(games.data, userId) : null), [games.data, userId]);
  const h2h = useMemo(() => (shared.data ? playerStats(shared.data, viewer.id) : null), [shared.data, viewer.id]);
  const [editing, setEditing] = useState(false);

  if (!profile.data) return null;
  const p = profile.data;

  return (
    <Page>
      <Header profile={p} isMe={isMe} onEdit={() => setEditing(true)} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label={dict.dashboard.singlesRating} value={Math.round(p.eloSingles)} />
        <Metric label={dict.dashboard.doublesRating} value={Math.round(p.eloDoubles)} />
        <Metric label={dict.common.games} value={stats?.total ?? "—"} hint={stats ? fmt(dict.games.record, { w: stats.wins, l: stats.losses }) : undefined} />
        <Metric label={dict.common.winRate} value={stats ? `${stats.winRate}%` : "—"} hint={stats ? `${dict.profile.best}: ${stats.bestStreak}` : undefined} />
      </div>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">{dict.profile.overview}</TabsTrigger>
          <TabsTrigger value="games">{dict.profile.games}</TabsTrigger>
          {!isMe && <TabsTrigger value="h2h">{dict.profile.headToHead}</TabsTrigger>}
          <TabsTrigger value="rally">{dict.profile.rally}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {stats && stats.total === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Trophy />
                </EmptyMedia>
                <EmptyTitle>{dict.profile.noStats}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>{dict.profile.ratingHistory}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<Skeleton className="h-64" />}>{history.data ? <RatingChart history={history.data} /> : <Skeleton className="h-64" />}</Suspense>
                </CardContent>
              </Card>
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>{dict.profile.monthly}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<Skeleton className="h-52" />}>{stats ? <MonthlyChart monthly={stats.monthly} /> : <Skeleton className="h-52" />}</Suspense>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{dict.profile.results}</CardTitle>
                    <CardDescription>{dict.profile.form}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {stats ? (
                      <>
                        <FormDots form={stats.form} />
                        {(["SINGLES", "DOUBLES"] as const).map((type) => {
                          const row = stats.byType[type];
                          const rate = row.total ? Math.round((row.wins / row.total) * 100) : 0;
                          return (
                            <div key={type} className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span>{type === "SINGLES" ? dict.common.singles : dict.common.doubles}</span>
                                <span className="tabular text-muted-foreground">
                                  {row.wins}/{row.total} · {rate}%
                                </span>
                              </div>
                              <Progress value={rate} />
                            </div>
                          );
                        })}
                      </>
                    ) : (
                      <Skeleton className="h-32" />
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="games">
          <Card className="py-2">
            <CardContent className="divide-y px-2">
              {games.data?.length ? (
                games.data.slice(0, 50).map((g) => <GameRow key={g.id} game={g} viewerId={userId} />)
              ) : (
                <p className="p-6 text-center text-sm text-muted-foreground">{dict.games.noGames}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {!isMe && (
          <TabsContent value="h2h" className="space-y-4">
            {h2h && h2h.total > 0 ? (
              <>
                <Card>
                  <CardContent className="flex items-center justify-around gap-4">
                    <div className="flex flex-col items-center gap-2">
                      <PlayerAvatar id={viewer.id} name={viewer.name} photoUrl={viewer.photoUrl} className="size-14" />
                      <span className="text-sm font-medium">{dict.common.you}</span>
                    </div>
                    <div className="tabular text-center">
                      <div className="text-4xl font-bold">
                        <span className="text-win">{h2h.wins}</span>
                        <span className="px-2 text-muted-foreground/50">–</span>
                        <span className="text-loss">{h2h.losses}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                        <Swords className="size-3" /> {h2h.total} {dict.common.games.toLowerCase()}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <PlayerAvatar id={p.userId} name={p.name} photoUrl={p.photoUrl} className="size-14" />
                      <span className="text-sm font-medium">{p.name.split(" ")[0]}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card className="py-2">
                  <CardContent className="divide-y px-2">
                    {shared.data?.map((g) => (
                      <GameRow key={g.id} game={g} viewerId={viewer.id} />
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Swords />
                  </EmptyMedia>
                  <EmptyTitle>{dict.profile.headToHead}</EmptyTitle>
                  <EmptyDescription>{dict.profile.headToHeadEmpty}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>
        )}

        <TabsContent value="rally">
          <ProfileRallyCard userId={userId} />
        </TabsContent>
      </Tabs>

      {isMe && <EditProfileDialog key={p.updatedAt} profile={p} open={editing} onOpenChange={setEditing} />}
    </Page>
  );
}
