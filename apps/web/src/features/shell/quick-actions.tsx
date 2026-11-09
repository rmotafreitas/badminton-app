import { Link } from "@tanstack/react-router";
import { CalendarCheck, ChevronRight, ClipboardList, Plus, Timer, Video } from "lucide-react";
import { useState } from "react";
import { useCloseOnNavigate } from "@/shared/hooks/use-close-on-navigate";
import { useDictionary } from "@/shared/i18n";
import { tick } from "@/shared/lib/haptics";
import { Button } from "@/shared/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/shared/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";

function useActions() {
  const t = useDictionary().ui.games;
  return [
    { to: "/score", search: {}, icon: Timer, title: t.keepScore, hint: t.keepScoreHint, primary: true },
    { to: "/games", search: { new: true }, icon: ClipboardList, title: t.enterResult, hint: t.enterResultHint },
    { to: "/training-review", search: {}, icon: CalendarCheck, title: t.logTraining, hint: t.logTrainingHint },
    { to: "/analysis/record", search: {}, icon: Video, title: t.recordRally, hint: t.recordRallyHint },
  ] as const;
}

/** The big + in the phone tab bar: what most people do on court, one thumb away. */
export function QuickActionsSheet() {
  const dict = useDictionary().ui;
  const [open, setOpen] = useState(false);
  const actions = useActions();
  useCloseOnNavigate(() => setOpen(false));
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="icon" className="tap-target h-11 w-14 rounded-2xl short:h-9 short:w-12" aria-label={dict.nav.newGame} onClick={() => tick()}>
          <Plus className="size-6" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{dict.games.whatNow}</DrawerTitle>
        </DrawerHeader>
        <nav className="grid gap-2 px-4 pb-4">
          {actions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              search={a.search}
              onClick={() => setOpen(false)}
              className={
                "tap-target flex min-h-16 items-center gap-4 rounded-2xl border px-4 py-3 transition active:scale-[0.99] " +
                ("primary" in a ? "border-primary bg-primary text-primary-foreground" : "bg-card")
              }
            >
              <a.icon className="size-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{a.title}</span>
                <span className={"block text-sm " + ("primary" in a ? "opacity-85" : "text-muted-foreground")}>{a.hint}</span>
              </span>
              <ChevronRight className="size-5 opacity-60" />
            </Link>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}

/** Desktop header: the same choices behind "New game". */
export function QuickActionsMenu() {
  const dict = useDictionary().ui;
  const actions = useActions();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus /> {dict.nav.newGame}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {actions.map((a) => (
          <DropdownMenuItem key={a.to} asChild className="items-start gap-3 py-2.5">
            <Link to={a.to} search={a.search}>
              <a.icon className="mt-0.5" />
              <span>
                <span className="block font-medium">{a.title}</span>
                <span className="block text-xs text-muted-foreground">{a.hint}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
