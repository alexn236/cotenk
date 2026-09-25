/** "just now", "5m ago", "3h ago", "2d ago" */
export function relativeTime(timestamp: number, now: number): string {
  const s = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
