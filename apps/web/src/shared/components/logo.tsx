import logo from "/images/logo.png";
import { cn } from "@/shared/lib/utils";

export function Logo({ className }: { className?: string }) {
  return <img src={logo} alt="" className={cn("size-8 rounded-lg", className)} draggable={false} />;
}

/** The mark + wordmark used in the sidebar and on the sign-in page. */
export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className="size-9 shadow-sm ring-1 ring-black/5" />
      <div className="grid leading-tight">
        <span className="font-semibold tracking-tight">Badminton Buddy</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}
