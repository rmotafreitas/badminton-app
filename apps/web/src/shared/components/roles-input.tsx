import type { Role } from "@bb/contracts";
import { useDictionary } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

const ROLE_ORDER: Role[] = ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"];

/**
 * Role chips, thumb-sized. Two kinds of account, like the server's rule: a system admin (platform only: no club, not a
 * player) or a club member (always a player, maybe also coach / club admin). Picking "Admin" clears the club roles and
 * vice versa. The admin chip only shows to someone who may grant it, or when the person already has it.
 */
export function RolesInput({ value, onChange, canGrantSystemAdmin }: { value: Role[]; onChange: (roles: Role[]) => void; canGrantSystemAdmin: boolean }) {
  const dict = useDictionary().ui;
  const visible = ROLE_ORDER.filter((r) => r !== "SYSTEM_ADMIN" || canGrantSystemAdmin || value.includes("SYSTEM_ADMIN"));
  const admin = value.includes("SYSTEM_ADMIN");
  const canToggle = (r: Role) => (r === "SYSTEM_ADMIN" ? canGrantSystemAdmin : r !== "PLAYER" || admin);
  const toggle = (r: Role, on: boolean) => {
    if (r === "SYSTEM_ADMIN") onChange(on ? ["PLAYER"] : ["SYSTEM_ADMIN"]);
    else if (admin) onChange(r === "PLAYER" ? ["PLAYER"] : [r, "PLAYER"]);
    else onChange(on ? value.filter((x) => x !== r) : [...value, r]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((r) => {
        const on = r === "SYSTEM_ADMIN" ? admin : !admin && (r === "PLAYER" || value.includes(r));
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            disabled={!canToggle(r)}
            onClick={() => toggle(r, on)}
            className={cn(
              "tap-target h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
            )}
          >
            {dict.roles[r]}
          </button>
        );
      })}
    </div>
  );
}
