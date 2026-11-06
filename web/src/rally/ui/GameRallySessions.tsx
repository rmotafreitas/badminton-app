/** Game page → analysed sessions linked to this game. */
import { Link } from "react-router-dom";
import { useDictionary, useLanguage } from "@/i18n";
import { useRallyRepo } from "@/di/container";
import { useQuery } from "@/hooks/useQuery";
import { formatDuration } from "./format";

export function GameRallySessions({ gameId }: { gameId: string }) {
  const t = useDictionary().rally;
  const { lang } = useLanguage();
  const repo = useRallyRepo();
  const { data } = useQuery(["rally-game", gameId], () => repo.listForGame(gameId), { enabled: !!gameId });
  if (!data?.length) return null;
  return (
    <div className="card mt-4">
      <header className="card-header">
        <p className="card-header-title">
          <span className="icon">
            <i className="mdi mdi-motion-play-outline" />
          </span>
          {t.title}
        </p>
      </header>
      <ul className="divide-y divide-gray-100 dark:divide-slate-800">
        {data.map((s) => (
          <li key={s.id}>
            <Link to={`/analysis/s/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50">
              <i className="mdi mdi-badminton text-xl text-emerald-600" />
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-medium truncate">
                  {s.title ?? t.session.untitled} · {s.recordedAt.toLocaleDateString(lang)} · {formatDuration(s.durationS)}
                </div>
                {s.summary && (
                  <div className="text-xs text-gray-500">
                    {s.summary.stats.rallies} {t.session.rallies.toLowerCase()} · {s.summary.stats.shots}{" "}
                    {t.session.shots.toLowerCase()}
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
