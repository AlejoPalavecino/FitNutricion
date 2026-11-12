import type { SupabaseClient } from '@supabase/supabase-js';
import { parseEntity } from '../../domain/validation';
import { KINDS, type Document, type EntityKind, type SyncGateway } from './engine';
export function parseDocument(value: unknown): Document {
  if (!value || typeof value !== 'object') throw new Error('Respuesta remota inválida.');
  const row = value as Record<string, unknown>;
  if (
    !KINDS.includes(row.kind as EntityKind) ||
    typeof row.entity_key !== 'string' ||
    !Number.isSafeInteger(row.version) ||
    Number(row.version) < 0 ||
    (row.payload !== null && (typeof row.payload !== 'object' || Array.isArray(row.payload)))
  )
    throw new Error('Contrato remoto inválido.');
  return {
    kind: row.kind as EntityKind,
    key: row.entity_key,
    version: Number(row.version),
    value: parseEntity(row.kind as EntityKind, row.payload),
  };
}
export function supabaseGateway(client: SupabaseClient, userId: string): SyncGateway {
  async function ownerToken(): Promise<string> {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session || data.session.user.id !== userId)
      throw new Error('La sesión cambió. La cola permanece asociada a su propietario.');
    return data.session.access_token;
  }
  return {
    async pull() {
      const records: Document[] = [];
      for (let offset = 0; ; offset += 500) {
        const token = await ownerToken();
        const { data, error } = await client
          .from('sync_documents')
          .select('kind,entity_key,payload,version')
          .eq('user_id', userId)
          .order('kind')
          .order('entity_key')
          .range(offset, offset + 499)
          .setHeader('Authorization', `Bearer ${token}`)
          .abortSignal(AbortSignal.timeout(10000));
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Respuesta incompleta.');
        records.push(...data.map(parseDocument));
        if (data.length < 500) return records;
      }
    },
    async push(operation) {
      parseEntity(operation.kind, operation.value);
      const token = await ownerToken();
      const { data, error } = await client
        .rpc('apply_sync_operation', {
          p_operation_id: operation.id,
          p_kind: operation.kind,
          p_entity_key: operation.key,
          p_expected_version: operation.baseVersion,
          p_payload: operation.value,
        })
        .setHeader('Authorization', `Bearer ${token}`)
        .abortSignal(AbortSignal.timeout(10000));
      if (error) throw error;
      if (!data || !['applied', 'conflict'].includes(data.status))
        throw new Error('Confirmación inválida.');
      return { status: data.status, document: parseDocument(data.document) };
    },
  };
}
