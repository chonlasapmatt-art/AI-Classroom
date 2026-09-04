import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from '../../../../supabase/functions/_shared/allowedOrigins';

/**
 * Which browser origins the Edge Functions answer.
 *
 * This is a sign-in bug wearing a network costume: an origin that is not on the list gets somebody
 * else's origin in the CORS header, the browser throws the response away, and the person at the
 * screen is told their name or password is wrong. So the rule that decides it is held here.
 */
const list = [
  'https://ai-smart-classroom-seven.vercel.app',
  '*-iwa3.vercel.app',
  'http://localhost:5173'
];

describe('the CORS allow list', () => {
  it('admits an address somebody actually wrote down', () => {
    expect(isAllowedOrigin('https://ai-smart-classroom-seven.vercel.app', list)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173', list)).toBe(true);
  });

  it('admits this project deployments, whose hostname is minted per deploy', () => {
    expect(isAllowedOrigin('https://ai-smart-classroom-b53qf6keu-iwa3.vercel.app', list)).toBe(true);
    expect(isAllowedOrigin('https://ai-smart-classroom-iwa3.vercel.app', list)).toBe(true);
  });

  it('refuses everything else, including a look-alike', () => {
    expect(isAllowedOrigin('https://evil.example.com', list)).toBe(false);
    expect(isAllowedOrigin('https://ai-smart-classroom-seven.vercel.app.evil.com', list)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5174', list)).toBe(false);
  });

  it('honours a wildcard over HTTPS only, so plain HTTP cannot borrow it', () => {
    expect(isAllowedOrigin('http://anything-iwa3.vercel.app', list)).toBe(false);
  });

  it('treats an empty list as admitting nobody', () => {
    expect(isAllowedOrigin('https://ai-smart-classroom-seven.vercel.app', [])).toBe(false);
  });
});
