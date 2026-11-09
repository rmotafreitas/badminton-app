import type { Role } from "@bb/contracts";
import { useDictionary } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

const ROLE_ORDER: Role[] = ["SYSTEM_ADMIN", "CLUB_ADMIN", "COACH", "PLAYER"];

/**
 * Role chips, thumb-sized. Everyone is a player (always on). The system admin chip only shows to someone who may grant
 * it (`canGrantSystemAdmin`), or when the person already has it; the server enforces the same rule.
 */
export function RolesInput({ value, onChange, canGrantSystemAdmin }: { value: Role[]; onChange: (roles: Role[]) => void; canGrantSystemAdmin: boolean }) {
  const dict = useDictionary().ui;
  const visible = ROLE_ORDER.filter((r) => r !== "SYSTEM_ADMIN" || canGrantSystemAdmin || value.includes("SYSTEM_ADMIN"));
  const canToggle = (r: Role) => r !== "PLAYER" && (r !== "SYSTEM_ADMIN" || canGrantSystemAdmin);
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((r) => {
        const on = r === "PLAYER" || value.includes(r);
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            disabled={!canToggle(r)}
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
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
