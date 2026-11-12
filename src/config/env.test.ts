import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './env';
describe('explicit deployment configuration', () => {
  it('requires an explicit production mode', () => {
    expect(parseEnvironment({}, true).configurationError).not.toBeNull();
    expect(parseEnvironment({ VITE_AUTH_MODE: 'local' }, true).configurationError).toBeNull();
  });
  it('does not silently switch a broken cloud deployment to local', () => {
    const c = parseEnvironment({ VITE_AUTH_MODE: 'cloud' }, true);
    expect(c.authMode).toBe('cloud');
    expect(c.configurationError).not.toBeNull();
    expect(c.isCloudConfigured).toBe(false);
  });
  it('rejects privileged secrets in the browser bundle', () => {
    expect(
      parseEnvironment(
        {
          VITE_AUTH_MODE: 'cloud',
          VITE_SUPABASE_URL: 'https://example.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'sb_secret_never_publish_this_key',
        },
        true,
      ).isCloudConfigured,
    ).toBe(false);
  });
});
