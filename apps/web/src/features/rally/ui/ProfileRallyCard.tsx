/**
 * Profile → "Rally Analysis": aggregated stats from analysed sessions where
 * this user is a linked player. Speed records only use reviewed or
 * high-confidence shots (computeStats already filters those).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAppContext } from "@/app/context";
import { profileRallyQuery } from "@/features/rally/api";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import type { ShotType } from "@/features/rally/engine/types";
import { buddyTheme } from "@/features/rally/overlay/theme";

export function ProfileRallyCard({ userId }: { userId: string }) {
  const t = useDictionary().rally;
  const { lang } = useLanguage();
  const { api } = useAppContext();
  const { data } = useQuery(profileRallyQuery(api, userId));

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

  const tile = "rounded-xl bg-muted/60 p-3";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.profile.title}</CardTitle>
        {!agg && <CardDescription>{t.profile.empty}</CardDescription>}
      </CardHeader>
      {agg && (
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div className="space-y-5 md:col-span-2">
            <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
              {[
                [t.profile.sessions, agg.sessions],
                [t.profile.totalDistance, `~${agg.distance} m`],
                [t.profile.topSpeed, agg.top ? `~${agg.top} km/h` : "—"],
                [t.profile.avgRally, agg.avgRally || "—"],
              ].map(([label, v]) => (
                <div key={String(label)} className={tile}>
                  <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
                  <div className="tabular text-lg font-semibold">{v}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t.profile.shotsByType}</div>
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
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{t.profile.perSession}</div>
              <div className="flex h-24 items-end gap-1">
                {agg.perSession.map((s) => {
                  const max = Math.max(1, ...agg.perSession.map((x) => x.distance));
                  return (
                    <Link
                      key={s.id}
                      to="/analysis/s/$serverId"
                      params={{ serverId: s.id }}
                      className="flex-1 rounded-t bg-primary/70 hover:bg-primary"
                      style={{ height: `${Math.max(4, (s.distance / max) * 100)}%` }}
                      title={`${s.date.toLocaleDateString(lang)} · ~${s.distance} m`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-center text-xs font-medium text-muted-foreground">{t.profile.heatmap}</div>
            <div className="mx-auto grid w-40 grid-cols-6 gap-px rounded-lg bg-[oklch(0.3_0.06_155)] p-1">
              {agg.heat.slice(0, 6 * 7).map((v, i) => {
                const max = Math.max(1, ...agg.heat);
                return <div key={i} className="aspect-square rounded-sm" style={{ background: `rgba(163, 230, 53, ${0.06 + 0.94 * (v / max)})` }} />;
              })}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
