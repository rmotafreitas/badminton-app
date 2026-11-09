/** A short buzz on Android (iOS Safari has no vibration API: silently nothing). */
export function tick(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // unsupported
  }
}
