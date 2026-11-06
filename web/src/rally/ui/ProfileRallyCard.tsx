/**
 * Profile → "Rally Analysis": aggregated stats from analysed sessions where
 * this user is a linked player. Speed records only use reviewed or
 * high-confidence shots (computeStats already filters those).
 */
import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useDictionary, useLanguage } from "@/i18n";
import { useRallyRepo } from "@/di/container";
import { useQuery } from "@/hooks/useQuery";
import type { ShotType } from "../engine/types";
import { buddyTheme } from "../overlay/theme";

export function ProfileRallyCard({ userId }: { userId: string }) {
  const t = useDictionary().rally;
  const { lang } = useLanguage();
  const repo = useRallyRepo();
  const { data } = useQuery(["rally-profile", userId], () => repo.profile(userId), { enabled: !!userId });

  const agg = useMemo(() => {
    if (!data?.length) return null;
    const byType: Partial<Record<ShotType, number>> = {};
    const heat = new Array<number>(6 * 13).fill(0);
    let distance = 0;
    let top = 0;
    let rallyShots = 0;
    let rallies = 0;
    const perSession: { id: string; date: Date; distance: number }[] = [];
    for (const e of data) {
      const p = e.summary?.stats.players.find((x) => x.id === e.playerId);
      if (!p || !e.summary) continue;
      distance += p.distanceM;
      top = Math.max(top, p.maxSpeedKmh ?? 0);
      for (const [k, n] of Object.entries(p.shotsByType)) byType[k as ShotType] = (byType[k as ShotType] ?? 0) + (n ?? 0);
      // Fold the far half onto the near half: "where you stand" on your side.
      p.heatmap.forEach((v, i) => {
        const row = Math.floor(i / 6);
        const col = i % 6;
        const nearRow = row >= 7 ? 12 - row : row;
        const nearCol = row >= 7 ? 5 - col : col;
        heat[nearRow * 6 + nearCol]! += v;
      });
      rallyShots += e.summary.stats.avgRallyShots * e.summary.stats.rallies;
      rallies += e.summary.stats.rallies;
      perSession.push({ id: e.id, date: e.recordedAt, distance: p.distanceM });
    }
    return {
      sessions: data.length,
      distance: Math.round(distance),
      byType,
      top,
      avgRally: rallies ? Math.round((rallyShots / rallies) * 10) / 10 : 0,
      heat,
      perSession: perSession.slice(0, 12).reverse(),
    };
  }, [data]);

  return (
    <div className="card mt-4">
      <header className="card-header">
        <p className="card-header-title">
          <span className="icon">
            <i aria-hidden className="mdi mdi-motion-play-outline" />
          </span>
          {t.profile.title}
        </p>
      </header>
      <div className="card-content">
        {!agg ? (
          <p className="text-sm text-gray-500 text-center py-4">{t.profile.empty}</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {[
                  [t.profile.sessions, agg.sessions],
                  [t.profile.totalDistance, `~${agg.distance} m`],
                  [t.profile.topSpeed, agg.top ? `~${agg.top} km/h` : "—"],
                  [t.profile.avgRally, agg.avgRally || "—"],
                ].map(([label, v]) => (
                  <div key={String(label)} className="rounded-xl bg-gray-50 dark:bg-slate-800/60 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
                    <div className="text-lg font-bold">{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">{t.profile.shotsByType}</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(agg.byType)
                    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                    .map(([ty, n]) => (
                      <span
                        key={ty}
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-slate-900"
                        style={{ background: buddyTheme.shotTypes[ty as ShotType] }}
                      >
                        {t.shotTypes[ty as ShotType]} {n}
                      </span>
                    ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">{t.profile.perSession}</div>
                <div className="flex items-end gap-1 h-24">
                  {agg.perSession.map((s) => {
                    const max = Math.max(1, ...agg.perSession.map((x) => x.distance));
                    return (
                      <Link
                        key={s.id}
                        to={`/analysis/s/${s.id}`}
                        className="flex-1 bg-emerald-500/80 hover:bg-emerald-500 rounded-t"
                        style={{ height: `${Math.max(4, (s.distance / max) * 100)}%` }}
                        title={`${s.date.toLocaleDateString(lang)} · ~${s.distance} m`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">{t.profile.heatmap}</div>
              <div className="grid grid-cols-6 gap-px bg-emerald-950 p-1 rounded-lg w-40 mx-auto">
                {agg.heat.slice(0, 6 * 7).map((v, i) => {
                  const max = Math.max(1, ...agg.heat);
                  return (
                    <div
                      key={i}
                      className="aspect-square rounded-sm"
                      style={{ background: `rgba(163, 230, 53, ${0.06 + 0.94 * (v / max)})` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
