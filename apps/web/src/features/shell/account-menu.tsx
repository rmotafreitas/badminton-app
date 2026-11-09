import type { SessionUser } from "@bb/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, Download, Languages, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useInstallAction } from "@/features/install";
import { useAppContext } from "@/app/context";
import { signOut } from "@/features/auth";
import { PlayerAvatar } from "@/shared/components/player-avatar";
import { useDictionary, useLanguage } from "@/shared/i18n";
import { type Theme, useTheme } from "@/shared/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/shared/ui/sidebar";

export function AccountMenu({ user }: { user: SessionUser }) {
  const dict = useDictionary().ui;
  const { theme, setTheme } = useTheme();
  const { lang, setLanguage } = useLanguage();
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const context = useAppContext();
  const { install, run, guide } = useInstallAction();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
          <PlayerAvatar id={user.id} name={user.name ?? user.email} photoUrl={user.photoUrl} className="size-8 rounded-lg" />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.name || user.email || user.phone}</span>
            <span className="truncate text-xs text-muted-foreground">{dict.roles[user.roles[0] ?? "PLAYER"]}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 rounded-xl" side={isMobile ? "bottom" : "right"} align="end" sideOffset={6}>
        <DropdownMenuLabel className="font-normal">
          <div className="grid text-sm leading-tight">
            <span className="truncate font-medium">{user.name || dict.common.you}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email ?? user.phone}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/profile" })}>
          <UserRound /> {dict.account.myProfile}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" /> {dict.account.theme}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light">
                <Sun /> {dict.account.light}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon /> {dict.account.dark}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor /> {dict.account.system}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> {dict.account.language}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={lang} onValueChange={(v) => setLanguage(v as "pt-PT" | "en-US")}>
              <DropdownMenuRadioItem value="pt-PT">Português</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en-US">English</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {!install.installed && (
          <DropdownMenuItem onSelect={() => void run()}>
            <Download /> {dict.install.menuItem}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await signOut(context);
            await navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut /> {dict.account.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
      {guide}
    </DropdownMenu>
  );
}
