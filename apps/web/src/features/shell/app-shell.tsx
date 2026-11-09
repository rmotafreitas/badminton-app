import type { SessionUser } from "@bb/contracts";
import { Link, useRouterState } from "@tanstack/react-router";
import { Activity, Building2, CalendarCheck, Home, Trophy, UserRound, Users, Video, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { hasRole } from "@/features/auth";
import { Brand } from "@/shared/components/logo";
import { useOnline } from "@/shared/hooks/use-online";
import { useDictionary } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { Separator } from "@/shared/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/shared/ui/sidebar";
import { AccountMenu } from "./account-menu";
import { QuickActionsMenu, QuickActionsSheet } from "./quick-actions";

type NavItem = { to: string; label: string; icon: typeof Home; exact?: boolean };

function useNav(user: SessionUser) {
  const nav = useDictionary().ui.nav;
  const groups: { label: string; items: NavItem[] }[] = [
    { label: nav.overview, items: [{ to: "/dashboard", label: nav.dashboard, icon: Home }] },
    {
      label: nav.play,
      items: [
        { to: "/games", label: nav.games, icon: Trophy },
        { to: "/analysis", label: nav.analysis, icon: Video },
        { to: "/training-review", label: nav.training, icon: CalendarCheck },
      ],
    },
    {
      label: nav.club,
      items: [
        { to: "/users", label: nav.members, icon: Users },
        ...(hasRole(user, "SYSTEM_ADMIN") ? [{ to: "/clubs", label: nav.clubs, icon: Building2 }] : []),
      ],
    },
    { label: nav.me, items: [{ to: "/profile", label: nav.profile, icon: UserRound, exact: true }] },
  ];
  return groups;
}

function useIsActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (to: string, exact = false) => (exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));
}

function NavLinks({ user }: { user: SessionUser }) {
  const isActive = useIsActive();
  const { setOpenMobile } = useSidebar();
  return (
    <>
      {useNav(user).map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={isActive(item.to, item.exact)} tooltip={item.label}>
                  <Link to={item.to} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}

/** Thumb-reachable tabs on phones; the sidebar stays for everything else. */
function BottomTabs() {
  const nav = useDictionary().ui.nav;
  const isActive = useIsActive();
  const tabs: NavItem[] = [
    { to: "/dashboard", label: nav.dashboard, icon: Home },
    { to: "/games", label: nav.games, icon: Trophy },
    { to: "/analysis", label: nav.analysis, icon: Video },
    { to: "/profile", label: nav.profile, icon: UserRound, exact: true },
  ];
  const [first, second, ...rest] = tabs;
  const tab = (item: NavItem) => (
    <Link
      key={item.to}
      to={item.to}
      className={cn(
        "tap-target flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-muted-foreground transition-colors short:min-h-11 short:py-1",
        isActive(item.to, item.exact) && "text-primary",
      )}
    >
      <item.icon className="size-5" />
      <span className="max-w-full truncate px-1 short:sr-only">{item.label}</span>
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-safe pb-safe backdrop-blur-lg lg:hidden">
      <div className="flex items-end">
        {first && tab(first)}
        {second && tab(second)}
        <div className="flex flex-1 justify-center">
          <QuickActionsSheet />
        </div>
        {rest.map(tab)}
      </div>
    </nav>
  );
}

/** Saved data keeps showing offline; this says why nothing refreshes. */
function OfflineBanner() {
  const online = useOnline();
  const dict = useDictionary().ui;
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 border-b bg-amber-500/15 px-4 py-2 text-sm text-amber-900 dark:text-amber-200">
      <WifiOff className="size-4" /> {dict.errors.offline}
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const dict = useDictionary().ui;
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard">
                  <Brand subtitle={dict.tagline} />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavLinks user={user} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <AccountMenu user={user} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-30 shrink-0 border-b bg-background/80 pt-safe backdrop-blur-lg lg:rounded-t-xl">
          <div className="flex h-14 items-center gap-2 px-3 short:h-11 lg:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <Activity className="size-4 text-primary lg:hidden" aria-hidden />
            <span className="text-sm font-medium lg:hidden">Badminton Buddy</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden lg:block">
                <QuickActionsMenu />
              </div>
            </div>
          </div>
        </header>
        <OfflineBanner />
        <main className="flex-1 px-safe pb-[calc(6rem+env(safe-area-inset-bottom))] short:pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </SidebarInset>
      <BottomTabs />
    </SidebarProvider>
  );
}
