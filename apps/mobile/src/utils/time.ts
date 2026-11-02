/** « à l'instant », « 12 min », « 3 h », « hier », « il y a 4 j ». */
export function timeAgo(timestamp: number, now = Date.now()): string {
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} j`;
}

export function minutesAgo(minutes: number): number {
  return Date.now() - minutes * 60_000;
}
