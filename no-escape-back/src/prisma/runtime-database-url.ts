/**
 * Prisma talks to one PM2 process. Two backends stay off a small Supabase
 * compute, and the transaction pooler (port 6543) cannot run Prisma's
 * interactive transactions — sessio stop uses one to reverse Focus XP.
 * The same pooler host accepts session mode on port 5432.
 */
export function runtimeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) {
    return url;
  }
  let next = url.replace(/:6543(?=\/|\?|$)/, ':5432');
  if (!/[?&]connection_limit=/.test(next)) {
    const join = next.includes('?') ? '&' : '?';
    next = `${next}${join}connection_limit=2&pool_timeout=20`;
  }
  return next;
}
