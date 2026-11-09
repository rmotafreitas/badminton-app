import { EllipsisVertical, MonitorDown, Share, SquarePlus, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/shared/components/logo";
import { ResponsiveSheet } from "@/shared/components/responsive-sheet";
import { useDictionary } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { installSnoozed, snoozeInstall, useInstall } from "./install";

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-4 rounded-2xl border bg-card p-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>
      <span className="flex-1 text-base">{children}</span>
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-primary [&_svg]:size-5">{icon}</span>
    </li>
  );
}

/** How to install where the browser has no install dialog: iOS (Share → Add to Home Screen) or a browser menu. */
export function InstallGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useDictionary().ui.install;
  const { platform } = useInstall();
  return (
    <ResponsiveSheet open={open} onOpenChange={onOpenChange} title={t.guideTitle} description={t.why}>
      <ol className="space-y-3">
        {platform === "ios" ? (
          <>
            <Step n={1} icon={<Share />}>
              {t.iosShare}
            </Step>
            <Step n={2} icon={<SquarePlus />}>
              {t.iosAdd}
            </Step>
            <Step n={3} icon={<span className="text-sm font-bold">{t.add}</span>}>
              {t.iosConfirm}
            </Step>
          </>
        ) : (
          <>
            <Step n={1} icon={<EllipsisVertical />}>
              {t.menuOpen}
            </Step>
            <Step n={2} icon={<MonitorDown />}>
              {t.menuInstall}
            </Step>
          </>
        )}
      </ol>
      {platform === "ios" && <p className="mt-4 text-sm text-muted-foreground">{t.iosSafariOnly}</p>}
    </ResponsiveSheet>
  );
}

/** Opens the browser's dialog when there is one, the guide otherwise. */
export function useInstallAction() {
  const install = useInstall();
  const [guide, setGuide] = useState(false);
  const run = async () => {
    const result = await install.prompt();
    if (result === "unavailable") setGuide(true);
  };
  return { install, run, guide: <InstallGuide open={guide} onOpenChange={setGuide} /> };
}

/**
 * Dashboard card on phones, until installed or dismissed (snoozed 3 weeks). One clear reason to install, one button.
 */
export function InstallCard() {
  const t = useDictionary().ui.install;
  const { install, run, guide } = useInstallAction();
  const [hidden, setHidden] = useState(installSnoozed);
  const mobile = install.platform !== "desktop";
  if (install.installed || hidden || (!mobile && !install.canPrompt)) return null;
  return (
    <Card className="relative gap-0 overflow-hidden border-primary/30 bg-primary/5 py-0">
      <CardContent className="flex items-center gap-4 py-4">
        <Logo className="size-12 rounded-xl shadow-sm" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.title}</p>
          <p className="text-sm text-muted-foreground">{t.short}</p>
        </div>
        <Button className="h-11 shrink-0" onClick={() => void run()}>
          {t.install}
        </Button>
      </CardContent>
      <button
        type="button"
        aria-label={t.notNow}
        className="tap-target absolute top-1 right-1 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        onClick={() => {
          snoozeInstall();
          setHidden(true);
        }}
      >
        <X className="size-4" />
      </button>
      {guide}
    </Card>
  );
}

/** "Installed — find it on your home screen." once, when the browser reports it. */
export function InstalledToast() {
  const t = useDictionary().ui.install;
  const { installed } = useInstall();
  const [was] = useState(installed);
  useEffect(() => {
    if (installed && !was) toast.success(t.installed);
  }, [installed, was, t.installed]);
  return null;
}
