/** A badminton court seen from above, as line art: the brand backdrop of the sign-in page. */
export function CourtArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 610 1340" className={className} fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="6">
        <rect x="3" y="3" width="604" height="1334" rx="4" />
        <line x1="49" y1="3" x2="49" y2="1337" />
        <line x1="561" y1="3" x2="561" y2="1337" />
        <line x1="3" y1="79" x2="607" y2="79" />
        <line x1="3" y1="1261" x2="607" y2="1261" />
        <line x1="3" y1="472" x2="607" y2="472" />
        <line x1="3" y1="868" x2="607" y2="868" />
        <line x1="305" y1="3" x2="305" y2="472" />
        <line x1="305" y1="868" x2="305" y2="1337" />
      </g>
      <line x1="-40" y1="670" x2="650" y2="670" stroke="currentColor" strokeWidth="10" strokeDasharray="2 14" strokeLinecap="round" />
    </svg>
  );
}
