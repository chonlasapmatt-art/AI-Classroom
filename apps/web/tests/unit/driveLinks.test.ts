import { describe, expect, it } from 'vitest';
import { isGoogleDriveUrl, normalizeGoogleDriveUrl } from '../../src/domain/driveLinks';

describe('Google Drive submission links', () => {
  it('accepts HTTPS Drive and Docs links and trims whitespace', () => {
    expect(normalizeGoogleDriveUrl('  https://drive.google.com/file/d/example/view  ')).toBe('https://drive.google.com/file/d/example/view');
    expect(isGoogleDriveUrl('https://docs.google.com/document/d/example/edit')).toBe(true);
  });

  it('rejects non-Google or insecure links', () => {
    expect(normalizeGoogleDriveUrl('http://drive.google.com/file/d/example')).toBeNull();
    expect(normalizeGoogleDriveUrl('https://example.com/assignment')).toBeNull();
    expect(isGoogleDriveUrl('not-a-url')).toBe(false);
  });
});
