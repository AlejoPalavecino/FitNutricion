import type { SupabaseClient } from '@supabase/supabase-js';
import { expect, it, vi } from 'vitest';
import { INITIAL_FOOD_ITEMS } from '../../data/seedData';
import { supabaseGateway } from './gateway';
const op = {
  id: crypto.randomUUID(),
  kind: 'food' as const,
  key: INITIAL_FOOD_ITEMS[0].id,
  value: { ...INITIAL_FOOD_ITEMS[0] },
  baseVersion: 0,
  attempts: 0,
  retryAt: 0,
};
it('never sends an account A outbox operation with an account B session', async () => {
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'B' }, access_token: 'token-B' } },
        error: null,
      }),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  };
  const gateway = supabaseGateway(client as unknown as SupabaseClient, 'A');
  await expect(gateway.push(op)).rejects.toThrow('sesión cambió');
  await expect(gateway.pull()).rejects.toThrow('sesión cambió');
  expect(client.rpc).not.toHaveBeenCalled();
  expect(client.from).not.toHaveBeenCalled();
});
it('pins the verified owner token on the request to avoid a check/use race', async () => {
  const result = {
    status: 'applied',
    document: { kind: op.kind, entity_key: op.key, payload: op.value, version: 1 },
  };
  const builder = {
    setHeader: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: result, error: null }),
  };
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'A' }, access_token: 'test-token-A' } },
        error: null,
      }),
    },
    rpc: vi.fn().mockReturnValue(builder),
  };
  await expect(
    supabaseGateway(client as unknown as SupabaseClient, 'A').push(op),
  ).resolves.toMatchObject({ status: 'applied' });
  expect(builder.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-token-A');
});
