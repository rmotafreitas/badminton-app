import type { Club, ClubMember, Role, SessionUser, UserSummary } from "@bb/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppContext } from "@/app/context";
import { hasRole } from "@/features/auth";
import { assignUser, clubQuery, clubsQuery, invalidateClubs } from "@/features/clubs";
import { usersQuery } from "@/features/users";
import { Page, PageHeader } from "@/shared/components/page-header";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { formatDate } from "@/shared/lib/format";
import { normalizeSearch } from "@/shared/lib/search";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

function RoleBadges({ roles }: { roles: Role[] }) {
  const dict = useDictionary().ui;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <Badge key={r} variant={r === "PLAYER" ? "secondary" : "default"} className={r === "PLAYER" ? "" : "bg-primary/12 text-primary hover:bg-primary/12"}>
          {dict.roles[r]}
        </Badge>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}

function Roster({ members, viewerId }: { members: ClubMember[]; viewerId: string }) {
  const dict = useDictionary().ui;
  const { lang } = useLanguage();
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      members
        .filter((m) => normalizeSearch(`${m.name ?? ""} ${m.email ?? ""}`).includes(normalizeSearch(query)))
        .sort((a, b) => b.eloSingles - a.eloSingles),
    [members, query],
  );
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <SearchBox value={query} onChange={setQuery} placeholder={dict.members.search} />
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-3 sm:w-10 sm:pl-6">#</TableHead>
              <TableHead>{dict.members.player}</TableHead>
              <TableHead className="hidden md:table-cell">{dict.members.roles}</TableHead>
              <TableHead className="text-right">{dict.common.singles}</TableHead>
              <TableHead className="pr-3 text-right sm:pr-2">{dict.common.doubles}</TableHead>
              <TableHead className="hidden pr-6 text-right lg:table-cell">{dict.members.joined}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m, i) => (
              <TableRow key={m.id} className={m.id === viewerId ? "bg-primary/5" : undefined}>
                <TableCell className="tabular pl-3 text-muted-foreground sm:pl-6">{i + 1}</TableCell>
                {/* A table cell only truncates with a width cap: on a phone the ratings must stay on screen. */}
                <TableCell className="max-w-[10rem] sm:max-w-none">
                  <Link to="/profile/$userId" params={{ userId: m.id }} className="flex items-center gap-3 hover:underline">
                    <PlayerAvatar id={m.id} name={m.name} photoUrl={m.photoUrl} className="size-8" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.name || dict.common.unknownPlayer}</div>
                      {m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <RoleBadges roles={m.roles} />
                </TableCell>
                <TableCell className="tabular text-right font-semibold">{Math.round(m.eloSingles)}</TableCell>
                <TableCell className="tabular pr-3 text-right font-semibold sm:pr-2">{Math.round(m.eloDoubles)}</TableCell>
                <TableCell className="hidden pr-6 text-right text-muted-foreground lg:table-cell">{formatDate(m.joinedAt, lang)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AssignCard({ users, clubs }: { users: UserSummary[]; clubs: Club[] }) {
  const dict = useDictionary().ui;
  const { api, queryClient } = useAppContext();
  const [userId, setUserId] = useState<string>();
  const [clubId, setClubId] = useState<string>();
  const assign = useMutation({
    mutationFn: () => assignUser(api, userId as string, clubId === "none" ? null : (clubId as string)),
    onSuccess: async () => {
      toast.success(dict.members.assigned);
      setUserId(undefined);
      void invalidateClubs(queryClient);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="size-4 text-primary" /> {dict.members.assignTitle}
        </CardTitle>
        <CardDescription>{dict.members.assignHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-full sm:flex-1">
            <SelectValue placeholder={dict.members.user} />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || u.email || u.phone}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clubId} onValueChange={setClubId}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={dict.members.clubField} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{dict.common.noClub}</SelectItem>
            {clubs.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!userId || !clubId || assign.isPending} onClick={() => assign.mutate()}>
          {assign.isPending && <Spinner />} {dict.members.assign}
        </Button>
      </CardContent>
    </Card>
  );
}

function AllUsers({ users, clubs }: { users: UserSummary[]; clubs: Club[] }) {
  const dict = useDictionary().ui;
  const [query, setQuery] = useState("");
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));
  const rows = users.filter((u) => normalizeSearch(`${u.name ?? ""} ${u.email ?? ""} ${u.phone ?? ""}`).includes(normalizeSearch(query)));
  return (
    <Card className="gap-4">
      <CardHeader>
        <SearchBox value={query} onChange={setQuery} placeholder={dict.members.search} />
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{dict.members.player}</TableHead>
              <TableHead className="hidden md:table-cell">{dict.members.roles}</TableHead>
              <TableHead className="pr-6">{dict.members.clubField}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-6">
                  <Link to="/profile/$userId" params={{ userId: u.id }} className="flex items-center gap-3 hover:underline">
                    <PlayerAvatar id={u.id} name={u.name} photoUrl={u.photoUrl} className="size-8" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.name || dict.common.unknownPlayer}</div>
                      <div className="truncate text-xs text-muted-foreground">{u.email ?? u.phone}</div>
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <RoleBadges roles={u.roles} />
                </TableCell>
                <TableCell className="pr-6 text-muted-foreground">{u.clubId ? clubName.get(u.clubId) : dict.common.noClub}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function MembersPage({ user }: { user: SessionUser }) {
  const dict = useDictionary().ui;
  const { api } = useAppContext();
  const admin = hasRole(user, "SYSTEM_ADMIN");
  const club = useQuery({ ...clubQuery(api, user.clubId ?? ""), enabled: !!user.clubId });
  const users = useQuery({ ...usersQuery(api), enabled: admin });
  const clubs = useQuery({ ...clubsQuery(api), enabled: admin });

  const roster = user.clubId ? (
    club.data ? (
      <Roster members={club.data.members} viewerId={user.id} />
    ) : (
      <Skeleton className="h-96 rounded-xl" />
    )
  ) : (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Users />
        </EmptyMedia>
        <EmptyTitle>{dict.dashboard.noClubTitle}</EmptyTitle>
        <EmptyDescription>{dict.dashboard.noClubBody}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <Page>
      <PageHeader title={dict.members.title} description={club.data ? fmt(dict.members.subtitle, { club: club.data.name }) : undefined} />
      {admin ? (
        <>
          {users.data && clubs.data && <AssignCard users={users.data} clubs={clubs.data} />}
          <Tabs defaultValue={user.clubId ? "club" : "all"}>
            <TabsList>
              {user.clubId && <TabsTrigger value="club">{club.data?.name ?? dict.nav.members}</TabsTrigger>}
              <TabsTrigger value="all">{dict.members.allUsers}</TabsTrigger>
            </TabsList>
            <TabsContent value="club">{roster}</TabsContent>
            <TabsContent value="all">{users.data && clubs.data ? <AllUsers users={users.data} clubs={clubs.data} /> : <Skeleton className="h-96 rounded-xl" />}</TabsContent>
          </Tabs>
        </>
      ) : (
        roster
      )}
    </Page>
  );
}
