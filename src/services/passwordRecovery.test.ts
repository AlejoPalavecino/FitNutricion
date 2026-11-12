import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { replaceRecoveredPassword, requestPasswordRecovery } from './passwordRecovery';
const mocks = vi.hoisted(() => ({ reset: vi.fn(), update: vi.fn() }));
vi.mock('./supabaseClient', () => ({
  supabase: { auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update } },
}));
beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://example.test' } });
  mocks.reset.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());
it('normalizes email and redirects to the configured app origin', async () => {
  await expect(requestPasswordRecovery(' User@Example.com ')).resolves.toContain('Si existe');
  expect(mocks.reset).toHaveBeenCalledWith('user@example.com', {
    redirectTo: 'https://example.test/?recovery=1',
  });
});
it('rejects invalid emails before a network request', async () => {
  await expect(requestPasswordRecovery('bad')).rejects.toThrow();
  expect(mocks.reset).not.toHaveBeenCalled();
});
it('validates the replacement password before submitting', async () => {
  await expect(replaceRecoveredPassword('tiny')).rejects.toThrow();
  expect(mocks.update).not.toHaveBeenCalled();
  await replaceRecoveredPassword('Testing12345!');
  expect(mocks.update).toHaveBeenCalledWith({ password: 'Testing12345!' });
});
it('does not expose raw backend errors', async () => {
  mocks.update.mockResolvedValue({ error: new Error('secret internal detail') });
  await expect(replaceRecoveredPassword('Testing12345!')).rejects.not.toThrow(
    'secret internal detail',
  );
});
