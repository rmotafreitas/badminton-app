/** Game page → analysed sessions linked to this game. */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Video } from "lucide-react";
import { useAppContext } from "@/app/context";
import { gameRallyQuery } from "@/features/rally/api";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatDuration } from "./format";

export function GameRallySessions({ gameId }: { gameId: string }) {
  const t = useDictionary().rally;
  const { lang } = useLanguage();
  const { api } = useAppContext();
  const { data } = useQuery(gameRallyQuery(api, gameId));
  if (!data?.length) return null;
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="size-4 text-primary" /> {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y px-2">
        {data.map((s) => (
          <Link
            key={s.id}
            to="/analysis/s/$serverId"
            params={{ serverId: s.id }}
            className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-accent/60"
          >
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium">
                {s.title ?? t.session.untitled} · {s.recordedAt.toLocaleDateString(lang)} · {formatDuration(s.durationS)}
              </div>
              {s.summary && (
                <div className="text-xs text-muted-foreground">
                  {s.summary.stats.rallies} {t.session.rallies.toLowerCase()} · {s.summary.stats.shots} {t.session.shots.toLowerCase()}
                </div>
              )}
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
