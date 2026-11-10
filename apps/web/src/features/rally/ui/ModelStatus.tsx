/**
 * Whether the analysis model is stored on this device. Shows "ready" once it is; otherwise its size and a button
 * to download it now (instead of during the first analysis).
 */
import { CircleCheck, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_MODELS_BYTES, appModelsCached, downloadAppModels } from "@/features/rally/engine/models/registry";
import { requestPersistence } from "@/features/rally/storage/idb";
import { useDictionary } from "@/shared/i18n";
import { fmt } from "@/shared/i18n/ui";
import { Button } from "@/shared/ui/button";
import { Progress } from "@/shared/ui/progress";
import { formatBytes, useOnline } from "./hooks";
import { Pill } from "./StatusBadges";

type State = "checking" | "ready" | "missing" | "downloading" | "failed";

/** `refreshKey` re-checks the device when it changes (e.g. an analysis finished and stored the model). */
export function ModelStatus({ refreshKey }: { refreshKey?: unknown }) {
  const t = useDictionary().rally.model;
  const online = useOnline();
  const [state, setState] = useState<State>("checking");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let alive = true;
    void appModelsCached().then((ok) => {
      if (alive) setState((s) => (s === "downloading" ? s : ok ? "ready" : "missing"));
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const download = async () => {
    setState("downloading");
    setProgress(0);
    void requestPersistence();
    try {
      await downloadAppModels(setProgress);
      setState("ready");
    } catch {
      setState("failed");
    }
  };

  if (state === "checking") return null;
  if (state === "ready")
    return (
      <div>
        <Pill tone="ok">
          <CircleCheck /> {t.ready}
        </Pill>
      </div>
    );
  if (state === "downloading")
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">
          {t.downloading} {Math.round(progress * 100)}%
        </p>
        <Progress value={Math.round(progress * 100)} />
      </div>
    );
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center">
      <p className={state === "failed" ? "flex-1 text-xs text-destructive" : "flex-1 text-xs text-muted-foreground"}>
        {state === "failed" ? t.failed : fmt(t.missing, { size: formatBytes(APP_MODELS_BYTES) })}
      </p>
      <Button size="sm" variant="outline" disabled={!online} onClick={() => void download()}>
        <Download /> {t.download}
      </Button>
    </div>
  );
}
