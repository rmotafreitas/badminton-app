import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/context/PageTitleContext";
import {
  useProfileService,
  useClubService,
  useGameService,
} from "@/di/container";
import { useDictionary, useLanguage } from "@/i18n";
import type { Language } from "@/i18n";
import type { Game } from "@/core/domain/game";
import type { Profile } from "@/core/domain/profile";
import type { Club } from "@/core/domain/club";
import { Input, Select, Textarea, ImageUpload, Table, ProfileSkeleton, SkeletonRows, Skeleton } from "@/components/ui";
import {
  WinLossDonut,
  EloLineChart,
  ActivityBarChart,
  EloGauge,
  TypeSplitChart,
  RecentFormPills,
} from "@/components/ui";
import { useQuery, useMutation, invalidateQueries } from "@/hooks/useQuery";
import type { Column } from "@/components/ui";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { getErrorMessage } from "@/lib/errors";
import { fallbackAvatar } from "@/lib/avatar-utils";
import { computePlayerStats } from "@/lib/stats-utils";

const sexOptions = [
  { value: "", label: "--" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

function sexLabel(value: string) {
  return sexOptions.find((o) => o.value === value)?.label ?? value;
}

function formatRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getAge(birthday: string): number {
  const b = new Date(birthday);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshUser } = useAuth();
  const profileService = useProfileService();
  const clubService = useClubService();
  const gameService = useGameService();
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [sex, setSex] = useState("");
  const [bio, setBio] = useState("");

  const photoFile = useRef<File | null | undefined>(undefined);
  const bannerFile = useRef<File | null | undefined>(undefined);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(undefined);
  const [bannerPreview, setBannerPreview] = useState<string | undefined>(undefined);
  const photoPreviewRef = useRef<string | undefined>(undefined);
  const bannerPreviewRef = useRef<string | undefined>(undefined);

  const [notification, setNotification] = useState<{
    type: "green" | "red";
    message: string;
  } | null>(null);

  const dict = useDictionary().profile;
  const gamesDict = useDictionary().games;
  const common = useDictionary().common;
  const { lang, setLanguage } = useLanguage();
  const { setPageTitle } = usePageTitle();

  const isOwnProfile = !id || id === user?.userId;
  const viewedUserId = id ?? user?.userId ?? "";
  const isCoachOrAdmin =
    !!user?.roles?.includes("CLUB_ADMIN") || !!user?.roles?.includes("COACH");
  const isSystemAdmin = !!user?.roles?.includes("SYSTEM_ADMIN");

  const profileKey = id ?? "me";
  const { data: profile, isLoading: profileLoading } = useQuery<Profile>(
    ["profile", profileKey],
    () => (id ? profileService.getProfile(id) : profileService.getMyProfile()),
    { staleTime: 60_000, persist: true },
  );

  const myClubId = user?.clubId ?? "";
  const { data: myClub } = useQuery<Club>(
    ["club", myClubId],
    () => clubService.getClubById(myClubId),
    { enabled: !!myClubId, staleTime: 60_000, persist: true },
  );
  const clubName = myClub?.name ?? null;

  // Role-based games fetching — mirrors the original branch priority.
  const mode: "own" | "coachAdmin" | "systemAdmin" | "player" = isOwnProfile
    ? "own"
    : isCoachOrAdmin
      ? "coachAdmin"
      : isSystemAdmin
        ? "systemAdmin"
        : "player";

  const {
    data: myGamesData,
    isLoading: myGamesLoading,
    refetch: refetchMyGames,
    isFetching: myGamesFetching,
  } = useQuery<Game[]>(
    ["games", "mine"],
    () => gameService.getMyGames(),
    { enabled: mode === "own", staleTime: 30_000, persist: true },
  );
  const {
    data: sharedGamesData,
    isLoading: sharedGamesLoading,
    refetch: refetchSharedGames,
    isFetching: sharedGamesFetching,
  } = useQuery<Game[]>(
    ["games", "shared", id ?? ""],
    () => gameService.getSharedGames(id!),
    { enabled: (mode === "coachAdmin" || mode === "player") && !!id, staleTime: 30_000, persist: true },
  );
  const {
    data: allPlayerGamesData,
    isLoading: allPlayerGamesLoading,
    refetch: refetchAllPlayerGames,
    isFetching: allPlayerGamesFetching,
  } = useQuery<Game[]>(
    ["games", "player", id ?? ""],
    () => gameService.getGamesByPlayerId(id!),
    { enabled: (mode === "coachAdmin" || mode === "systemAdmin") && !!id, staleTime: 30_000, persist: true },
  );

  const myGames = useMemo(() => myGamesData ?? [], [myGamesData]);
  const sharedGames = useMemo(() => sharedGamesData ?? [], [sharedGamesData]);
  const allPlayerGames = useMemo(() => allPlayerGamesData ?? [], [allPlayerGamesData]);

  // Sync form fields + previews whenever the fetched profile changes. The
  // setStates are intentional: they seed editable form fields from external
  // (cached) data, and only run when `profile` actually changes.
  useEffect(() => {
    if (!profile) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(profile.name || "");
    setBirthday(
      profile.birthday ? new Date(profile.birthday).toISOString().split("T")[0] : "",
    );
    setSex(profile.sex || "");
    setBio(profile.bio || "");
    setPhotoPreview(profile.photo || undefined);
    setBannerPreview(profile.banner || undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [profile]);

  useEffect(() => {
    if (isOwnProfile) {
      setPageTitle("");
    } else if (profile?.name) {
      setPageTitle(profile.name);
    }
    return () => setPageTitle("");
  }, [isOwnProfile, profile?.name, setPageTitle]);

  const handlePhotoCropped = useCallback((file: File | null) => {
    if (photoPreviewRef.current) URL.revokeObjectURL(photoPreviewRef.current);
    photoFile.current = file;
    if (file) {
      const url = URL.createObjectURL(file);
      photoPreviewRef.current = url;
      setPhotoPreview(url);
    } else {
      photoFile.current = null;
      photoPreviewRef.current = undefined;
      setPhotoPreview(undefined);
    }
  }, []);

  const handleBannerCropped = useCallback((file: File | null) => {
    if (bannerPreviewRef.current) URL.revokeObjectURL(bannerPreviewRef.current);
    bannerFile.current = file;
    if (file) {
      const url = URL.createObjectURL(file);
      bannerPreviewRef.current = url;
      setBannerPreview(url);
    } else {
      bannerFile.current = null;
      bannerPreviewRef.current = undefined;
      setBannerPreview(undefined);
    }
  }, []);

  const updateMutation = useMutation(
    (payload: {
      name?: string;
      birthday?: string;
      sex?: string;
      bio?: string;
      photo?: File | null;
      banner?: File | null;
    }) => profileService.updateMyProfile(payload),
    {
      onSuccess: async () => {
        // Profile header + club roster (name/photo) + auth user (name/photo/elo
        // in future) must resync.
        invalidateQueries(["profile", "me"], ["club", myClubId]);
        await refreshUser();
      },
    },
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { name, birthday: birthday || undefined, sex, bio };
      if (photoFile.current !== undefined) payload.photo = photoFile.current;
      if (bannerFile.current !== undefined) payload.banner = bannerFile.current;

      const updated = await updateMutation.mutate(payload);
      setPhotoPreview(updated.photo || undefined);
      setBannerPreview(updated.banner || undefined);

      if (photoPreviewRef.current) {
        URL.revokeObjectURL(photoPreviewRef.current);
        photoPreviewRef.current = undefined;
      }
      if (bannerPreviewRef.current) {
        URL.revokeObjectURL(bannerPreviewRef.current);
        bannerPreviewRef.current = undefined;
      }
      photoFile.current = undefined;
      bannerFile.current = undefined;

      setNotification({ type: "green", message: dict.profileUpdated });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update profile", err);
      setNotification({ type: "red", message: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Re-sync from cache (refetch profile) and discard local image previews.
    invalidateQueries(["profile", "me"]);
    photoFile.current = undefined;
    bannerFile.current = undefined;
    if (photoPreviewRef.current) {
      URL.revokeObjectURL(photoPreviewRef.current);
      photoPreviewRef.current = undefined;
    }
    if (bannerPreviewRef.current) {
      URL.revokeObjectURL(bannerPreviewRef.current);
      bannerPreviewRef.current = undefined;
    }
    setIsEditing(false);
  };

  const primaryGames = useMemo(() => {
    if (mode === "own") return myGames;
    if (mode === "coachAdmin" || mode === "systemAdmin") return allPlayerGames;
    return sharedGames;
  }, [mode, myGames, allPlayerGames, sharedGames]);

  // Whether the primary games query for the current mode is on its very first
  // fetch with no cached data yet. Used to show skeletons instead of the
  // "No games played" empty state while loading.
  const primaryGamesLoading =
    mode === "own"
      ? myGamesLoading
      : mode === "player"
        ? sharedGamesLoading
        : allPlayerGamesLoading;

  const hasAnyGames = primaryGames.length > 0 || sharedGames.length > 0;

  const gameStats = useMemo(() => {
    const wins = primaryGames.filter((g) =>
      g.winner === "team1"
        ? g.team1PlayerIds.includes(viewedUserId)
        : g.winner === "team2"
          ? g.team2PlayerIds.includes(viewedUserId)
          : false,
    ).length;
    const losses = primaryGames.length - wins;
    return { total: primaryGames.length, wins, losses };
  }, [primaryGames, viewedUserId]);

  const locale = lang === "pt-PT" ? "pt-PT" : "en-US";
  const playerStats = useMemo(
    () =>
      computePlayerStats(
        primaryGames,
        viewedUserId,
        profile?.eloSingles ?? 200,
        locale,
      ),
    [primaryGames, viewedUserId, profile?.eloSingles, locale],
  );

  if (profileLoading && !profile) {
    return (
      <section className="section main-section">
        <ProfileSkeleton />
      </section>
    );
  }

  const avatarUrl = photoPreview || fallbackAvatar(profile?.name, profile?.email, profile?.userId);
  const bannerUrl = bannerPreview;
  const displayName = profile?.name || profile?.email?.split("@")[0];
  const eloSingles = profile?.eloSingles ?? 200;
  const eloDoubles = profile?.eloDoubles ?? 200;

  function playerImg(player: any, cls: string) {
    if (player?.profile?.photo) {
      return <img src={player.profile.photo} alt="" className={cls} />;
    }
    const initial = (player?.profile?.name ||
      player?.email ||
      "?")[0].toUpperCase();
    return (
      <span
        className={`${cls} bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground`}
      >
        {initial}
      </span>
    );
  }

  function playerLine(player: any) {
    return (
      <span className="inline-flex items-center gap-1">
        {playerImg(player, "w-5 h-5 rounded-full object-cover shrink-0")}
        <span>
          {player?.profile?.name || player?.email?.split("@")[0] || "?"}
        </span>
      </span>
    );
  }

  const typeLabel = (type: string) =>
    type === "SINGLES" ? gamesDict.singles : gamesDict.doubles;

  const gameColumns: Column<Game>[] = [
    {
      header: gamesDict.type,
      accessor: (g) => (
        <span className="text-xs font-medium">{typeLabel(g.type)}</span>
      ),
    },
    {
      header: gamesDict.team1,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team1Players?.map((p) => (
            <span key={p.id}>{playerLine(p)}</span>
          ))}
        </div>
      ),
    },
    {
      header: gamesDict.team2,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team2Players?.map((p) => (
            <span key={p.id}>{playerLine(p)}</span>
          ))}
        </div>
      ),
    },
    {
      header: gamesDict.result,
      accessor: (g) => {
        const isTeam1 = g.team1PlayerIds.includes(viewedUserId);
        const won = g.winner === (isTeam1 ? "team1" : "team2");
        return (
          <div className="flex items-center gap-1">
            <span
              className={`font-bold text-sm ${won ? "text-success" : "text-destructive"}`}
            >
              {g.resultSummary}
            </span>
            <span
              className={`text-[10px] uppercase font-semibold px-1 rounded ${g.isQuickMode ? "bg-success/10 text-success" : "bg-accent/10 text-accent-foreground"}`}
            >
              {g.isQuickMode ? gamesDict.quickBadge : gamesDict.setsBadge}
            </span>
          </div>
        );
      },
    },
    {
      header: gamesDict.date,
      accessor: (g) => (
        <small
          className="text-muted-foreground whitespace-nowrap"
          title={new Date(g.playedAt).toLocaleString()}
        >
          {new Date(g.playedAt).toLocaleDateString(
            lang === "pt-PT" ? "pt-PT" : "en-US",
          )}
        </small>
      ),
    },
  ];

  return (
    <>
      {isOwnProfile && (
        <section className="is-hero-bar">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
            <h1 className="title">{dict.myProfile}</h1>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`button ${isEditing ? "light" : "blue"}`}
            >
              <span className="icon">
                <i
                  className={`mdi ${isEditing ? "mdi-eye" : "mdi-pencil"}`}
                ></i>
              </span>
              <span>{isEditing ? dict.viewProfile : dict.editProfile}</span>
            </button>
          </div>
        </section>
      )}

      <section className="section main-section">
        {notification && (
          <div className={`notification ${notification.type} mb-4`}>
            <div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0">
              <div>
                <span className="icon">
                  <i
                    className={`mdi ${notification.type === "green" ? "mdi-check" : "mdi-alert"}`}
                  ></i>
                </span>
                {notification.message}
              </div>
              <button
                type="button"
                className="button small textual"
                onClick={() => setNotification(null)}
              >
                {common.close}
              </button>
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="card">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon">
                  <i className="mdi mdi-account-edit"></i>
                </span>
                {dict.editProfile}
              </p>
            </header>
            <div className="card-content">
              <form onSubmit={handleSave}>
                <ImageUpload
                  aspect={1}
                  label={dict.photo}
                  currentImage={photoPreview}
                  onCropped={handlePhotoCropped}
                />

                <hr />

                <Input
                  label={dict.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  iconLeft="mdi-account"
                />

                <Input
                  label="Email"
                  value={user?.email || ""}
                  readOnly
                  iconLeft="mdi-email"
                />

                <Input
                  label={dict.birthday}
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  iconLeft="mdi-calendar"
                />

                <Select
                  label={dict.sex}
                  options={sexOptions}
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                />

                <Select
                  label="Language / Idioma"
                  options={[
                    { value: "pt-PT", label: "Português" },
                    { value: "en-US", label: "English" },
                  ]}
                  value={lang}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                />

                <hr />

                <Textarea
                  label={dict.bio}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder="Tell us about yourself..."
                />

                <hr />

                <ImageUpload
                  aspect={3 / 1}
                  label={dict.banner}
                  currentImage={bannerPreview}
                  onCropped={handleBannerCropped}
                />

                <hr />

                <div className="field grouped">
                  <div className="control">
                    <button
                      type="submit"
                      className="button green"
                      disabled={saving}
                    >
                      {saving ? dict.saving : dict.saveProfile}
                    </button>
                  </div>
                  <div className="control">
                    <button
                      type="button"
                      className="button light"
                      onClick={handleCancelEdit}
                    >
                      {common.cancel}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div>
            {/* Masthead: banner + overlapping profile card */}
            <div className="relative min-h-[230px] sm:min-h-[280px]">
              <div className="h-[140px] sm:h-[200px] overflow-hidden">
                {bannerUrl ? (
                  <img
                    src={bannerUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-primary/20 to-accent/30" />
                )}
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-card border-b border-border px-3 sm:px-6 pb-4 sm:pb-5">
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-5">
                  <div className="w-[90px] h-[90px] sm:w-[120px] sm:h-[120px] rounded-full border-[4px] border-card bg-card shadow-md overflow-hidden flex-shrink-0 -mt-[45px] sm:-mt-[60px] sm:ml-3">
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = fallbackAvatar(
                          profile?.name,
                          profile?.email,
                          profile?.userId,
                        );
                      }}
                    />
                  </div>

                  <div className="text-center sm:text-left sm:pb-0.5">
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <h2 className="text-[1.25rem] sm:text-[1.75rem] font-bold text-foreground leading-tight">
                        {displayName}
                      </h2>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning-foreground text-xs font-bold" title="Singles ELO">
                        <i className="mdi mdi-account text-xs"></i>
                        {eloSingles}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground text-xs font-bold" title="Doubles ELO">
                        <i className="mdi mdi-account-multiple text-xs"></i>
                        {eloDoubles}
                      </span>
                    </div>
                    {profile?.bio ? (
                      <p className="text-sm text-muted-foreground italic mt-0.5">
                        {profile.bio}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground/70 italic mt-0.5">
                        {dict.bio} —
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Details card */}
            <div className="card mt-4">
              <div className="card-content px-5 sm:px-8 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-email-outline text-muted-foreground/70 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                        Email
                      </p>
                      <p className="text-sm text-foreground">
                        {profile?.email || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-phone text-muted-foreground/70 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                        {dict.phone}
                      </p>
                      <p className="text-sm text-foreground">
                        {profile?.phone || "—"}
                      </p>
                    </div>
                  </div>

                  {profile?.birthday && (
                    <div className="flex items-center gap-3">
                      <i className="mdi mdi-cake-variant text-muted-foreground/70 text-lg w-5 text-center"></i>
                      <div>
                        <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                          {dict.birthday}
                        </p>
                        <p className="text-sm text-foreground">
                          {new Date(profile.birthday).toLocaleDateString(
                            lang === "pt-PT" ? "pt-PT" : "en-US",
                          )}
                          {" · "}
                          {getAge(profile.birthday)}{" "}
                          {lang === "pt-PT" ? "anos" : "years"}
                        </p>
                      </div>
                    </div>
                  )}

                  {profile?.sex && (
                    <div className="flex items-center gap-3">
                      <i className="mdi mdi-gender-male-female text-muted-foreground/70 text-lg w-5 text-center"></i>
                      <div>
                        <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                          {dict.sex}
                        </p>
                        <p className="text-sm text-foreground capitalize">
                          {sexLabel(profile.sex)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-shield-account text-muted-foreground/70 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                        {dict.roles}
                      </p>
                      <p className="text-sm text-foreground">
                        {profile?.roles?.length
                          ? profile.roles.map(formatRole).join(", ")
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-domain text-muted-foreground/70 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                        {dict.club}
                      </p>
                      <p className="text-sm text-foreground">
                        {clubName ?? dict.noClub}
                      </p>
                    </div>
                  </div>

                  {profile?.createdAt && (
                    <div className="flex items-center gap-3">
                      <i className="mdi mdi-calendar-plus text-muted-foreground/70 text-lg w-5 text-center"></i>
                      <div>
                        <p className="text-xs text-muted-foreground/70 uppercase tracking-wide">
                          {dict.joined}
                        </p>
                        <p className="text-sm text-foreground">
                          {new Date(profile.createdAt).toLocaleDateString(
                            lang === "pt-PT" ? "pt-PT" : "en-US",
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats overview — 4 stat cards */}
            {primaryGamesLoading && primaryGames.length === 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="card">
                    <div className="card-content flex flex-col items-center gap-2">
                      <Skeleton className="h-9 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : primaryGames.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                <div className="card">
                  <div className="card-content text-center py-4">
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">{gameStats.total}</p>
                    <p className="text-xs text-muted-foreground/70 uppercase tracking-wide mt-1">{dict.totalGames}</p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-content text-center py-4">
                    <p className="text-2xl sm:text-3xl font-bold text-success">{gameStats.wins}</p>
                    <p className="text-xs text-muted-foreground/70 uppercase tracking-wide mt-1">{dict.wins}</p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-content text-center py-4">
                    <p className="text-2xl sm:text-3xl font-bold text-destructive">{gameStats.losses}</p>
                    <p className="text-xs text-muted-foreground/70 uppercase tracking-wide mt-1">{dict.losses}</p>
                  </div>
                </div>
                <div className="card">
                  <div className="card-content text-center py-4">
                    <p className="text-2xl sm:text-3xl font-bold text-primary">
                      {playerStats.currentStreak.count}
                    </p>
                    <p className="text-xs text-muted-foreground/70 uppercase tracking-wide mt-1">
                      {playerStats.currentStreak.type === "W" ? dict.streakWin : dict.streakLoss}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Charts row 1: Win/Loss donut + ELO gauge + Game types */}
            {primaryGamesLoading && primaryGames.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card">
                    <div className="card-content flex items-center justify-center py-12">
                      <Skeleton className="h-32 w-32 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : primaryGames.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                {/* Win/Loss donut */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-chart-donut"></i></span>
                      {dict.winRate}
                    </p>
                  </header>
                  <div className="card-content flex flex-col items-center justify-center py-6">
                    <WinLossDonut wins={gameStats.wins} losses={gameStats.losses} size={170} />
                  </div>
                </div>

                {/* ELO gauge */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-trophy-variant"></i></span>
                      ELO
                    </p>
                  </header>
                  <div className="card-content flex flex-col items-center justify-center py-6">
                    <div className="flex items-center justify-center gap-4">
                      <div className="flex flex-col items-center">
                        <EloGauge elo={eloSingles} min={0} max={1000} size={130} />
                        <span className="text-xs text-muted-foreground mt-1 font-medium">{gamesDict.singles}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <EloGauge elo={eloDoubles} min={0} max={1000} size={130} />
                        <span className="text-xs text-muted-foreground mt-1 font-medium">{gamesDict.doubles}</span>
                      </div>
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        {dict.bestStreak}: <span className="font-bold text-success">{playerStats.bestStreak}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dict.avgScorePerGame}: <span className="font-bold text-foreground">{playerStats.avgScorePerGame}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Game type split */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-chart-bar"></i></span>
                      {dict.gameTypes}
                    </p>
                  </header>
                  <div className="card-content py-4">
                    <TypeSplitChart
                      singles={playerStats.byType.SINGLES.total}
                      doubles={playerStats.byType.DOUBLES.total}
                      height={170}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Charts row 2: ELO progression line + Monthly activity bars */}
            {primaryGamesLoading && primaryGames.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="card">
                    <div className="card-content py-8">
                      <Skeleton className="h-40 w-full" />
                    </div>
                  </div>
                ))}
              </div>
            ) : primaryGames.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {/* ELO progression line */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-chart-line"></i></span>
                      {dict.eloProgression}
                    </p>
                  </header>
                  <div className="card-content py-4">
                    <EloLineChart
                      singles={playerStats.eloProgression.singles}
                      doubles={playerStats.eloProgression.doubles}
                      height={200}
                    />
                  </div>
                </div>

                {/* Monthly activity bar chart */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-chart-bar"></i></span>
                      {dict.monthlyActivity}
                    </p>
                  </header>
                  <div className="card-content py-4">
                    <ActivityBarChart
                      data={playerStats.monthlyActivity}
                      height={200}
                      showSplit
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Charts row 3: Recent form + Activity heatmap */}
            {primaryGamesLoading && primaryGames.length === 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div className="card">
                  <div className="card-content py-8">
                    <div className="flex gap-2">
                      {Array.from({ length: 10 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-8 rounded-full" />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-content py-5">
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: 60 }).map((_, i) => (
                        <Skeleton key={i} className="h-3 w-3 rounded-sm" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : primaryGames.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                {/* Recent form pills */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-fire"></i></span>
                      {dict.recentForm}
                    </p>
                  </header>
                  <div className="card-content py-5">
                    <RecentFormPills form={playerStats.recentForm} />
                  </div>
                </div>

                {/* Activity heatmap */}
                <div className="card">
                  <header className="card-header">
                    <p className="card-header-title">
                      <span className="icon"><i className="mdi mdi-calendar-check"></i></span>
                      {dict.activity}
                    </p>
                  </header>
                  <div className="card-content px-3 sm:px-5 pt-5 pb-4">
                    <ActivityHeatmap
                      games={primaryGames}
                      userId={viewedUserId}
                      lang={lang}
                      labels={{
                        gamesCount: dict.gamesCount,
                        gamesCountPlural: dict.gamesCountPlural,
                        winsShort: dict.winsShort,
                        lossesShort: dict.lossesShort,
                        legendLess: dict.activityLegendLess,
                        legendMore: dict.activityLegendMore,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Games tables */}
            {primaryGamesLoading && !hasAnyGames ? (
              <div className="mt-4">
                <Table
                  title={dict.recentGames}
                  titleIcon="mdi-history"
                  columns={gameColumns}
                  data={[]}
                  loading
                  loadingMessage={common.loading}
                  skeletonRows={<SkeletonRows rows={4} cols={5} />}
                />
              </div>
            ) : hasAnyGames ? (
              <div className="mt-4 space-y-4">
                {mode === "coachAdmin" ? (
                  <>
                    <Table
                      title={dict.sharedGames}
                      titleIcon="mdi-sword-cross"
                      columns={gameColumns}
                      data={sharedGames}
                      loading={sharedGamesLoading && sharedGames.length === 0}
                      emptyMessage={dict.noSharedGames}
                      loadingMessage={common.loading}
                      skeletonRows={<SkeletonRows rows={4} cols={5} />}
                      refetch={refetchSharedGames}
                      isFetching={sharedGamesFetching}
                    />
                    <Table
                      title={dict.allPlayerGames}
                      titleIcon="mdi-history"
                      columns={gameColumns}
                      data={allPlayerGames}
                      loading={allPlayerGamesLoading && allPlayerGames.length === 0}
                      emptyMessage={dict.noGames}
                      loadingMessage={common.loading}
                      skeletonRows={<SkeletonRows rows={4} cols={5} />}
                      refetch={refetchAllPlayerGames}
                      isFetching={allPlayerGamesFetching}
                    />
                  </>
                ) : (
                  <Table
                    title={
                      mode === "own" || mode === "systemAdmin"
                        ? dict.recentGames
                        : dict.sharedGames
                    }
                    titleIcon="mdi-history"
                    columns={gameColumns}
                    data={primaryGames}
                    loading={primaryGamesLoading && primaryGames.length === 0}
                    emptyMessage={
                      mode === "own" || mode === "systemAdmin"
                        ? dict.noGames
                        : dict.noSharedGames
                    }
                    loadingMessage={common.loading}
                    skeletonRows={<SkeletonRows rows={4} cols={5} />}
                    refetch={
                      mode === "own"
                        ? refetchMyGames
                        : mode === "player"
                          ? refetchSharedGames
                          : refetchAllPlayerGames
                    }
                    isFetching={
                      mode === "own"
                        ? myGamesFetching
                        : mode === "player"
                          ? sharedGamesFetching
                          : allPlayerGamesFetching
                    }
                  />
                )}
              </div>
            ) : (
              <div className="card mt-4">
                <div className="card-content text-center py-8 text-muted-foreground/70 text-sm">
                  <i className="mdi mdi-racquetball text-3xl block mb-2"></i>
                  {dict.noGames}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
