import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useProfileService,
  useClubService,
  useGameService,
} from "@/di/container";
import { useDictionary, useLanguage } from "@/i18n";
import type { Language } from "@/i18n";
import type { Game } from "@/core/domain/game";
import { Input, Select, Textarea, ImageUpload, Table } from "@/components/ui";
import type { Column } from "@/components/ui";
import { getErrorMessage } from "@/lib/errors";

const fallbackAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(seed)}`;

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
  const { user } = useAuth();
  const profileService = useProfileService();
  const clubService = useClubService();
  const gameService = useGameService();
  const [profile, setProfile] = useState<any>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [sex, setSex] = useState("");
  const [bio, setBio] = useState("");

  const photoFile = useRef<File | null | undefined>(undefined);
  const bannerFile = useRef<File | null | undefined>(undefined);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(
    undefined,
  );
  const [bannerPreview, setBannerPreview] = useState<string | undefined>(
    undefined,
  );
  const photoPreviewRef = useRef<string | undefined>(undefined);
  const bannerPreviewRef = useRef<string | undefined>(undefined);

  const [notification, setNotification] = useState<{
    type: "green" | "red";
    message: string;
  } | null>(null);

  const dict = useDictionary().profile;
  const gamesDict = useDictionary().games;
  const navDict = useDictionary().nav;
  const common = useDictionary().common;
  const { lang, setLanguage } = useLanguage();

  const fetchProfile = useCallback(async () => {
    try {
      const data = await profileService.getMyProfile();
      setProfile(data);
      setName(data.name || "");
      setBirthday(
        data.birthday
          ? new Date(data.birthday).toISOString().split("T")[0]
          : "",
      );
      setSex(data.sex || "");
      setBio(data.bio || "");
      setPhotoPreview(data.photo || undefined);
      setBannerPreview(data.banner || undefined);
    } catch (err) {
      console.error("Failed to fetch profile", err);
    } finally {
      setLoading(false);
    }
  }, [profileService]);

  useEffect(() => {
    if (user?.clubId) {
      clubService
        .getClubById(user.clubId)
        .then((c) => setClubName(c.name))
        .catch(() => {});
    }
  }, [user?.clubId, clubService]);

  useEffect(() => {
    gameService
      .getMyGames()
      .then(setGames)
      .catch(() => {});
  }, [gameService]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { name, birthday: birthday || undefined, sex, bio };

      if (photoFile.current !== undefined) payload.photo = photoFile.current;
      if (bannerFile.current !== undefined) payload.banner = bannerFile.current;

      const updated = await profileService.updateMyProfile(payload);
      setProfile(updated);
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
    fetchProfile().then(() => {
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
    });
  };

  const gameStats = useMemo(() => {
    const userId = user?.userId;
    const wins = games.filter((g) =>
      g.winner === "team1"
        ? g.team1PlayerIds.includes(userId!)
        : g.winner === "team2"
          ? g.team2PlayerIds.includes(userId!)
          : false,
    ).length;
    const losses = games.length - wins;
    return { total: games.length, wins, losses };
  }, [games, user?.userId]);

  const heatmapData = useMemo(() => {
    const today = new Date();
    const days = 364; // 52 weeks, ~1 year
    const userId = user?.userId;
    const map = new Map<string, { count: number; wins: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      map.set(d.toISOString().split("T")[0], { count: 0, wins: 0 });
    }
    for (const g of games) {
      const key = new Date(g.playedAt).toISOString().split("T")[0];
      if (!map.has(key)) continue;
      const entry = map.get(key)!;
      entry.count++;
      const isTeam1 = g.team1PlayerIds.includes(userId!);
      if (g.winner === (isTeam1 ? "team1" : "team2")) entry.wins++;
      map.set(key, entry);
    }
    const maxVal = Math.max(1, ...Array.from(map.values()).map((e) => e.count));
    return Array.from(map.entries()).map(([date, { count, wins }]) => ({
      date,
      count,
      wins,
      level: count === 0 ? 0 : Math.ceil((count / maxVal) * 4),
    }));
  }, [games, user?.userId]);

  const heatmapWeeks = useMemo(() => {
    const weeks: (typeof heatmapData)[] = [];
    for (let i = 0; i < heatmapData.length; i += 7) {
      weeks.push(heatmapData.slice(i, i + 7));
    }
    return weeks;
  }, [heatmapData]);

  if (loading) {
    return (
      <section className="section main-section">
        <div className="p-8 text-center">{common.loading}</div>
      </section>
    );
  }

  const avatarUrl = photoPreview || fallbackAvatar(user?.email || "user");
  const bannerUrl = bannerPreview;
  const displayName = profile?.name || user?.email?.split("@")[0];

  function heatmapColor(level: number) {
    if (level === 0) return "bg-gray-100";
    if (level === 1) return "bg-emerald-200";
    if (level === 2) return "bg-emerald-400";
    if (level === 3) return "bg-emerald-500";
    return "bg-emerald-700";
  }

  function playerImg(player: any, cls: string) {
    if (player?.profile?.photo) {
      return <img src={player.profile.photo} alt="" className={cls} />;
    }
    const initial = (player?.profile?.name ||
      player?.email ||
      "?")[0].toUpperCase();
    return (
      <span
        className={`${cls} bg-gray-200 flex items-center justify-center text-[10px] font-medium text-gray-500`}
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

  const gameColumns: Column<any>[] = [
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
          {g.team1Players?.map((p: any) => (
            <span key={p.id}>{playerLine(p)}</span>
          ))}
        </div>
      ),
    },
    {
      header: gamesDict.team2,
      accessor: (g) => (
        <div className="flex flex-col gap-0.5">
          {g.team2Players?.map((p: any) => (
            <span key={p.id}>{playerLine(p)}</span>
          ))}
        </div>
      ),
    },
    {
      header: gamesDict.result,
      accessor: (g) => {
        const userId = user?.userId;
        const isTeam1 = g.team1PlayerIds.includes(userId!);
        const won = g.winner === (isTeam1 ? "team1" : "team2");
        return (
          <div className="flex items-center gap-1">
            <span
              className={`font-bold text-sm ${won ? "text-emerald-600" : "text-red-500"}`}
            >
              {g.resultSummary}
            </span>
            <span
              className={`text-[10px] uppercase font-semibold px-1 rounded ${g.isQuickMode ? "bg-green-100 text-green-700" : "bg-purple-100 text-purple-700"}`}
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
          className="text-gray-500 whitespace-nowrap"
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
      <section className="is-title-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <ul>
            <li>{navDict.admin}</li>
          </ul>
        </div>
      </section>

      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">{dict.myProfile}</h1>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`button ${isEditing ? "light" : "blue"}`}
          >
            <span className="icon">
              <i className={`mdi ${isEditing ? "mdi-eye" : "mdi-pencil"}`}></i>
            </span>
            <span>{isEditing ? dict.viewProfile : dict.editProfile}</span>
          </button>
        </div>
      </section>

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
                  <div className="w-full h-full bg-gradient-to-r from-blue-100 to-indigo-200" />
                )}
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-white px-3 sm:px-6 pb-4 sm:pb-5">
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-5">
                  <div className="w-[90px] h-[90px] sm:w-[120px] sm:h-[120px] rounded-full border-[4px] border-white bg-white shadow-md overflow-hidden flex-shrink-0 -mt-[45px] sm:-mt-[60px] sm:ml-3">
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="w-full h-full object-cover rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = fallbackAvatar(
                          user?.email || "user",
                        );
                      }}
                    />
                  </div>

                  <div className="text-center sm:text-left sm:pb-0.5">
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <h2 className="text-[1.25rem] sm:text-[1.75rem] font-bold text-gray-800 leading-tight">
                        {displayName}
                      </h2>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                        <i className="mdi mdi-trophy text-xs"></i>
                        {user?.elo ?? 200}
                      </span>
                    </div>
                    {profile?.bio ? (
                      <p className="text-sm text-gray-500 italic mt-0.5">
                        {profile.bio}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic mt-0.5">
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
                    <i className="mdi mdi-email-outline text-gray-400 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">
                        Email
                      </p>
                      <p className="text-sm text-gray-700">
                        {user?.email || "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-phone text-gray-400 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">
                        {dict.phone}
                      </p>
                      <p className="text-sm text-gray-700">
                        {user?.phone || "—"}
                      </p>
                    </div>
                  </div>

                  {profile?.birthday && (
                    <div className="flex items-center gap-3">
                      <i className="mdi mdi-cake-variant text-gray-400 text-lg w-5 text-center"></i>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">
                          {dict.birthday}
                        </p>
                        <p className="text-sm text-gray-700">
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
                      <i className="mdi mdi-gender-male-female text-gray-400 text-lg w-5 text-center"></i>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">
                          {dict.sex}
                        </p>
                        <p className="text-sm text-gray-700 capitalize">
                          {sexLabel(profile.sex)}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-shield-account text-gray-400 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">
                        {dict.roles}
                      </p>
                      <p className="text-sm text-gray-700">
                        {user?.roles?.length
                          ? user.roles.map(formatRole).join(", ")
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <i className="mdi mdi-domain text-gray-400 text-lg w-5 text-center"></i>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide">
                        {dict.club}
                      </p>
                      <p className="text-sm text-gray-700">
                        {clubName ?? dict.noClub}
                      </p>
                    </div>
                  </div>

                  {profile?.createdAt && (
                    <div className="flex items-center gap-3">
                      <i className="mdi mdi-calendar-plus text-gray-400 text-lg w-5 text-center"></i>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wide">
                          {dict.joined}
                        </p>
                        <p className="text-sm text-gray-700">
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

            {/* Stats + Activity row */}
            {games.length > 0 && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                  <div className="card">
                    <header className="card-header">
                      <p className="card-header-title">
                        <span className="icon">
                          <i className="mdi mdi-chart-bar"></i>
                        </span>
                        {dict.stats}
                      </p>
                    </header>
                    <div className="card-content px-5 sm:px-8 py-5">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div>
                          <p className="text-2xl sm:text-3xl font-bold text-gray-800">
                            {gameStats.total}
                          </p>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">
                            {dict.totalGames}
                          </p>
                        </div>
                        <div>
                          <p className="text-2xl sm:text-3xl font-bold text-emerald-600">
                            {gameStats.wins}
                          </p>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">
                            {dict.wins}
                          </p>
                        </div>
                        <div>
                          <p className="text-2xl sm:text-3xl font-bold text-red-500">
                            {gameStats.losses}
                          </p>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">
                            {dict.losses}
                          </p>
                        </div>
                        <div className="flex flex-col items-center">
                          <svg
                            width="52"
                            height="52"
                            viewBox="0 0 52 52"
                            className="-my-1"
                          >
                            <circle
                              cx="26"
                              cy="26"
                              r="22"
                              fill="none"
                              stroke="#e5e7eb"
                              strokeWidth="5"
                            />
                            <circle
                              cx="26"
                              cy="26"
                              r="22"
                              fill="none"
                              stroke={
                                gameStats.total > 0
                                  ? gameStats.wins >= gameStats.losses
                                    ? "#10b981"
                                    : "#ef4444"
                                  : "#e5e7eb"
                              }
                              strokeWidth="5"
                              strokeLinecap="round"
                              strokeDasharray={`${(gameStats.total > 0 ? gameStats.wins / gameStats.total : 0) * 138.23} 138.23`}
                              transform="rotate(-90 26 26)"
                            />
                            <text
                              x="26"
                              y="28"
                              textAnchor="middle"
                              className="text-xs font-bold"
                              fill="#374151"
                            >
                              {gameStats.total > 0
                                ? Math.round(
                                    (gameStats.wins / gameStats.total) * 100,
                                  )
                                : 0}
                              %
                            </text>
                          </svg>
                          <p className="text-xs text-gray-400 uppercase tracking-wide mt-1">
                            {dict.winRate}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <header className="card-header">
                      <p className="card-header-title">
                        <span className="icon">
                          <i className="mdi mdi-calendar-check"></i>
                        </span>
                        {dict.activity}
                      </p>
                    </header>
                    <div className="card-content px-3 sm:px-6 py-4 overflow-x-auto">
                      <div className="flex gap-[3px]">
                        {heatmapWeeks.map((week, wi) => (
                          <div key={wi} className="flex flex-col gap-[3px]">
                            {week.map((day) => (
                              <div
                                key={day.date}
                                title={`${day.date}: ${day.count} game${day.count !== 1 ? "s" : ""}`}
                                className={`w-[12px] h-[12px] sm:w-[14px] sm:h-[14px] rounded-sm ${heatmapColor(day.level)}`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-400 mt-2 px-0.5">
                        <span>{heatmapData[0]?.date}</span>
                        <span>{heatmapData[heatmapData.length - 1]?.date}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent games */}
                <div className="mt-4">
                  <Table
                    title={dict.recentGames}
                    titleIcon="mdi-history"
                    columns={gameColumns}
                    data={games}
                  />
                </div>
              </>
            )}

            {games.length === 0 && (
              <div className="card mt-4">
                <div className="card-content text-center py-8 text-gray-400 text-sm">
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
