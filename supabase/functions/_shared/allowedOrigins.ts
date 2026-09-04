/**
 * Which browser origins the Edge Functions answer, as one rule with no environment around it.
 *
 * It lives apart from `http.ts` so it can be tested by the same suite that tests the app: the file
 * that reads `ALLOWED_ORIGINS` needs a Deno runtime, and this — the part that can be wrong — needs
 * nothing. Being wrong here does not look like a network problem, it looks like a sign-in refusing
 * a correct password, which is exactly the kind of bug that survives a green test run.
 */
export function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (allowed.includes(origin)) return true;
  return allowed.some((entry) => {
    // One pattern, and only one: `*suffix` admits any HTTPS origin ending in the rest of the entry,
    // which is how a hosting platform's per-deployment hostnames are covered without listing them.
    if (!entry.startsWith('*') || entry.length < 2) return false;
    const suffix = entry.slice(1);
    return origin.startsWith('https://') && origin.endsWith(suffix);
  });
}
