const GOOGLE_DRIVE_HOSTS = new Set([
  'drive.google.com',
  'docs.google.com',
  'drive.usercontent.google.com'
]);

/**
 * Keep Drive links as links rather than copying file bytes into the classroom database.
 * Only HTTPS Google Drive/Docs hosts are accepted so a submission cannot become an
 * arbitrary external redirect in the teacher view.
 */
export function normalizeGoogleDriveUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || !GOOGLE_DRIVE_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isGoogleDriveUrl(value: string | null | undefined): value is string {
  return normalizeGoogleDriveUrl(value) !== null;
}
