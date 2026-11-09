import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Stable pastel tint per person, so initials-only avatars are still told apart. */
function tint(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [152, 170, 85, 200, 25, 330, 260];
  return `oklch(0.9 0.06 ${hues[hash % hues.length]})`;
}

export function PlayerAvatar({
  name,
  photoUrl,
  id,
  className,
}: {
  name: string | null | undefined;
  photoUrl: string | null | undefined;
  id?: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt="" loading="lazy" decoding="async" />}
      <AvatarFallback className="text-xs font-semibold text-emerald-950" style={{ background: tint(id ?? name ?? "") }}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Overlapping avatars for a team. */
export function TeamAvatars({ players, className }: { players: { id: string; name: string | null; photoUrl: string | null }[]; className?: string }) {
  return (
    <div className={cn("flex -space-x-2", className)}>
      {players.map((p) => (
        <PlayerAvatar key={p.id} id={p.id} name={p.name} photoUrl={p.photoUrl} className="size-8 ring-2 ring-card" />
      ))}
    </div>
  );
}
