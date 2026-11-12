import { describe, expect, it } from 'vitest';
import { createLocalCredential, verifyLegacyCredential, verifyLocalCredential } from './localCredentials';
describe('local credentials (not data encryption)', () => {
  it('uses a different random salt for the same password and verifies only the correct password', async () => {
    const a = await createLocalCredential('A-test-password-2026!');
    const b = await createLocalCredential('A-test-password-2026!');
    expect(a.saltHex).not.toBe(b.saltHex);
    expect(a.hashHex).not.toBe(b.hashHex);
    expect(await verifyLocalCredential('A-test-password-2026!', a)).toBe(true);
    expect(await verifyLocalCredential('wrong', a)).toBe(false);
  });
  it('rejects the non-cryptographic fallback and malformed credentials', async () => {
    expect(await verifyLegacyCredential('a@example.test', 'password', 'fallback-42')).toBe(false);
    expect(await verifyLocalCredential('password', { algorithm: 'PBKDF2-SHA256', iterations: 1, saltHex: 'xx', hashHex: 'xx' })).toBe(false);
  });
  it('permits a one-way upgrade only after a valid legacy password', async () => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('a@example.test::fitnutricion-salt-v1::password'));
    const hash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyLegacyCredential('a@example.test', 'password', hash)).toBe(true);
    expect(await verifyLegacyCredential('a@example.test', 'incorrect', hash)).toBe(false);
  });
});
