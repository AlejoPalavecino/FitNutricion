from pathlib import Path
p=Path('src/services/sync/gateway.ts');s=p.read_text();old='''  return {
    async pull() {
      const records: Document[] = [];''';new='''  async function ownerToken(): Promise<string> {
    const {data,error}=await client.auth.getSession();
    if(error || !data.session || data.session.user.id !== userId)throw new Error('La sesión cambió. La cola permanece asociada a su propietario.');
    return data.session.access_token;
  }
  return {
    async pull() {
      const records: Document[] = [];'''
assert old in s;s=s.replace(old,new)
s=s.replace('''      for (let offset = 0; ; offset += 500) {
        const { data, error }''','''      for (let offset = 0; ; offset += 500) {
        const token=await ownerToken();
        const { data, error }''')
s=s.replace('''.range(offset, offset + 499)
          .abortSignal''','''.range(offset, offset + 499)
          .setHeader('Authorization',`Bearer ${token}`)
          .abortSignal''')
s=s.replace('''      parseEntity(operation.kind, operation.value);
      const { data, error }''','''      parseEntity(operation.kind, operation.value);
      const token=await ownerToken();
      const { data, error }''')
s=s.replace('''          p_payload: operation.value,
        })
        .abortSignal''','''          p_payload: operation.value,
        })
        .setHeader('Authorization',`Bearer ${token}`)
        .abortSignal''')
p.write_text(s)
Path('src/services/sync/gateway.test.ts').write_text(r'''import {it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabaseGateway} from './gateway';
import {INITIAL_FOOD_ITEMS} from '../../data/seedData';
const op={id:crypto.randomUUID(),kind:'food' as const,key:INITIAL_FOOD_ITEMS[0].id,value:{...INITIAL_FOOD_ITEMS[0]},baseVersion:0,attempts:0,retryAt:0};
it('never sends an account A outbox operation with an account B session',async()=>{
 const client={auth:{getSession:vi.fn().mockResolvedValue({data:{session:{user:{id:'B'},access_token:'token-B'}},error:null})},rpc:vi.fn(),from:vi.fn()};
 const gateway=supabaseGateway(client as unknown as SupabaseClient,'A');
 await expect(gateway.push(op)).rejects.toThrow('sesión cambió');await expect(gateway.pull()).rejects.toThrow('sesión cambió');expect(client.rpc).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
});
it('pins the verified owner token on the request to avoid a check/use race',async()=>{
 const result={status:'applied',document:{kind:op.kind,entity_key:op.key,payload:op.value,version:1}};
 const builder={setHeader:vi.fn().mockReturnThis(),abortSignal:vi.fn().mockResolvedValue({data:result,error:null})};
 const client={auth:{getSession:vi.fn().mockResolvedValue({data:{session:{user:{id:'A'},access_token:'test-token-A'}},error:null})},rpc:vi.fn().mockReturnValue(builder)};
 await expect(supabaseGateway(client as unknown as SupabaseClient,'A').push(op)).resolves.toMatchObject({status:'applied'});expect(builder.setHeader).toHaveBeenCalledWith('Authorization','Bearer test-token-A');
});
''')
p=Path('tests/e2e/app.spec.ts');s=p.read_text().replace("name: 'Crear mi cuenta segura'","name: 'Crear mi cuenta', exact: true");p.write_text(s)
p=Path('src/components/navigation/PwaStatus.tsx');s=p.read_text().replace('if (alive && registration?.waiting) setWaiting(registration.waiting);','if (alive && navigator.serviceWorker.controller && registration?.waiting) setWaiting(registration.waiting);');p.write_text(s)
