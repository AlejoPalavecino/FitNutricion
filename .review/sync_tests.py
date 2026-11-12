from pathlib import Path
Path('src/services/sync/engine.test.ts').write_text(r'''import { describe,expect,it } from 'vitest';
import {SyncEngine,emptyJournal,materialize,documentId,type Journal,type JournalStorage,type SyncGateway,type Document,type Operation} from './engine';
function memory():JournalStorage{
 let journal=emptyJournal();let chain=Promise.resolve();
 return {transaction<T>(work:(j:Journal)=>Promise<T>):Promise<T>{const result=chain.then(async()=>{const copy=structuredClone(journal);const value=await work(copy);journal=copy;return value;});chain=result.then(()=>undefined,()=>undefined);return result;}};
}
function server(){
 const docs=new Map<string,Document>();const receipts=new Map<string,Document>();let offline=false;let loseResponse=false;
 const gateway:SyncGateway={async pull(){if(offline)throw new Error('offline');return structuredClone([...docs.values()]);},async push(op:Operation){
  if(offline)throw new Error('offline');const receipt=receipts.get(op.id);if(receipt)return {status:'applied',document:receipt};
  const key=documentId(op);const previous=docs.get(key);if((previous?.version??0)!==op.baseVersion)return {status:'conflict',document:previous!};
  const next={kind:op.kind,key:op.key,value:op.value,version:(previous?.version??0)+1};docs.set(key,next);receipts.set(op.id,next);
  if(loseResponse){loseResponse=false;throw new Error('response lost after commit');}return {status:'applied',document:next};
 }};return {docs,gateway,offline:(v:boolean)=>{offline=v;},loseNextResponse:()=>{loseResponse=true;}};
}
const food=(name:string)=>({kind:'food' as const,key:'off-123',value:{id:'off-123',name}});
describe('durable versioned sync',()=>{
 it('persists offline create/edit/delete across reload and reconnect',async()=>{
  const backend=server(),storage=memory(),a=new SyncEngine(storage,backend.gateway);backend.offline(true);
  await a.enqueue([food('first')]);await a.enqueue([food('edited')]);await a.enqueue([{...food(''),value:null}]);expect((await a.read()).operations).toHaveLength(3);
  const reloaded=new SyncEngine(storage,backend.gateway);backend.offline(false);expect((await reloaded.synchronize()).operations).toHaveLength(0);expect(backend.docs.get('food:off-123')).toMatchObject({value:null,version:3});
 });
 it('keeps stable operation IDs after a lost acknowledgement',async()=>{
  const backend=server(),a=new SyncEngine(memory(),backend.gateway);await a.enqueue([food('original')]);const id=(await a.read()).operations[0].id;
  backend.loseNextResponse();await a.synchronize();expect((await a.read()).operations[0].id).toBe(id);await a.synchronize(true);expect((await a.read()).operations).toHaveLength(0);expect(backend.docs.get('food:off-123')?.version).toBe(1);
 });
 it('preserves conflicting local data until an explicit choice',async()=>{
  const backend=server(),a=new SyncEngine(memory(),backend.gateway),b=new SyncEngine(memory(),backend.gateway);
  await a.enqueue([food('one')]);await a.synchronize();await b.synchronize();await a.enqueue([food('from A')]);await a.synchronize();await b.enqueue([food('from B')]);
  const j=await b.synchronize();expect(j.operations[0].conflict?.value?.name).toBe('from A');expect(materialize(j)[0].value?.name).toBe('from B');await b.resolve(j.operations[0].id,'local');await b.synchronize();expect(backend.docs.get('food:off-123')?.value?.name).toBe('from B');
 });
 it('does not resurrect a remote tombstone during legacy import',async()=>{
  const backend=server(),a=new SyncEngine(memory(),backend.gateway);await a.enqueue([food('one'),{...food(''),value:null}]);await a.synchronize();
  const old=new SyncEngine(memory(),backend.gateway);await old.bootstrap([food('stale')]);await old.synchronize();expect((await old.read()).operations).toHaveLength(0);expect(materialize(await old.read())[0].value).toBeNull();
 });
 it('retains divergent legacy copies for explicit reconciliation',async()=>{
  const backend=server(),a=new SyncEngine(memory(),backend.gateway);await a.bootstrap([food('cloud legacy'),food('device legacy')]);const j=await a.synchronize();expect(j.operations).toHaveLength(1);expect(j.operations[0].conflict?.version).toBe(1);expect(j.operations[0].value?.name).toBe('device legacy');await a.resolve(j.operations[0].id,'remote');expect(materialize(await a.read())[0].value?.name).toBe('cloud legacy');
 });
 it('keeps historical names, sets and macros after definitions change',async()=>{
  const backend=server(),a=new SyncEngine(memory(),backend.gateway);await a.enqueue([{kind:'session',key:'s1',value:{id:'s1',routineName:'Original',sets:[{id:'set1',weightKg:40}]}},{kind:'timeline',key:'m1',value:{id:'m1',calculatedMacros:{kcal:400}}}]);await a.synchronize();await a.enqueue([{kind:'routine',key:'r1',value:{id:'r1',name:'Renamed',exercises:[]}}]);await a.synchronize();expect(backend.docs.get('session:s1')?.value?.routineName).toBe('Original');expect(backend.docs.get('timeline:m1')?.value?.calculatedMacros).toEqual({kcal:400});
 });
 it('serializes parallel enqueue operations with ordered revisions',async()=>{
  const backend=server(),storage=memory(),a=new SyncEngine(storage,backend.gateway),b=new SyncEngine(storage,backend.gateway);await Promise.all([a.enqueue([food('first')]),b.enqueue([food('second')])]);expect((await a.read()).operations.map(op=>op.baseVersion)).toEqual([0,1]);await a.synchronize();expect(backend.docs.get('food:off-123')?.version).toBe(2);
 });
 it('detects an edit made from a stale UI instead of silently rebasing',async()=>{
  const backend=server(),a=new SyncEngine(memory(),backend.gateway);await a.enqueue([food('initial')]);await a.synchronize();await a.enqueue([food('newer')]);await a.synchronize();await a.enqueue([{...food('stale edit'),expectedVersion:1,previous:food('initial').value}]);const j=await a.synchronize();expect(j.operations[0].conflict?.version).toBe(2);expect(backend.docs.get('food:off-123')?.value?.name).toBe('newer');
 });
 it('isolates journals for two owners importing the same product key',async()=>{
  const serverA=server(),serverB=server(),a=new SyncEngine(memory(),serverA.gateway),b=new SyncEngine(memory(),serverB.gateway);await a.enqueue([food('A')]);await b.enqueue([food('B')]);await a.synchronize();await b.synchronize();expect(serverA.docs.get('food:off-123')?.value?.name).toBe('A');expect(serverB.docs.get('food:off-123')?.value?.name).toBe('B');
 });
});
''')
Path('src/store/useNutritionStore.integrity.test.ts').write_text(r'''import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {WorkoutSetLog} from '../types/nutrition';
vi.mock('../lib/storage',()=>({offlineFirstStorage:{getItem:vi.fn().mockResolvedValue(null),setItem:vi.fn().mockResolvedValue(undefined),removeItem:vi.fn().mockResolvedValue(undefined)}}));
vi.mock('../services/cloudSyncService',async(original)=>{const actual=await original<typeof import('../services/cloudSyncService')>();return {...actual,cloudSyncService:{connect:vi.fn().mockResolvedValue(undefined),capture:vi.fn(),disconnect:vi.fn()}};});
import {useNutritionStore} from './useNutritionStore';import {cloudSyncService} from '../services/cloudSyncService';
const owner={id:'11111111-1111-4111-8111-111111111111',fullName:'Test',email:'test@example.test',authMode:'cloud' as const};
const legacySet:WorkoutSetLog={id:'live-og-0025-1',exerciseId:'og-0025',setNumber:1,setType:'working',weightKg:60,reps:8,isCompleted:true,isPrWeight:false,isPr1RM:false,estimated1RM:0};
const payload={startTime:'12:00',endTime:'13:00',durationMinutes:60,sets:[legacySet]};
describe('history integrity',()=>{
 beforeEach(async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));useNutritionStore.getState().clearActiveSessionState();await useNutritionStore.getState().initializeForUser(owner);useNutritionStore.getState().completeOnboarding({birthDate:'1995-01-01',sex:'male',heightCm:180,weightKg:80,initialPal:1.55,trainingExperience:'intermediate',selectedPhase:'maintenance'});await Promise.resolve();vi.clearAllMocks();});
 afterEach(()=>vi.useRealTimers());
 it('uses fresh set IDs and does not mutate prior sessions',()=>{const first=useNutritionStore.getState().logWorkoutSession(payload);const second=useNutritionStore.getState().logWorkoutSession({...payload,sets:[{...legacySet,weightKg:65}]});expect(first.id).not.toBe(second.id);expect(first.sets[0].id).not.toBe(second.sets[0].id);expect(first.sets[0].id).not.toBe(legacySet.id);expect(first.sets[0].weightKg).toBe(60);expect(cloudSyncService.capture).toHaveBeenLastCalledWith(owner.id,expect.objectContaining({workoutSessions:[second,first]}));});
 it('captures the edited historical weigh-in and subsequent trends',()=>{const base=useNutritionStore.getState().biometricLogs[0];useNutritionStore.setState({biometricLogs:[{...base,id:crypto.randomUUID(),date:'2026-11-01'},{...base,id:crypto.randomUUID(),date:'2026-11-12'}]});useNutritionStore.getState().addOrUpdateBiometricLog({date:'2026-11-01',scaleWeightKg:79});expect(cloudSyncService.capture).toHaveBeenLastCalledWith(owner.id,expect.objectContaining({biometricLogs:expect.arrayContaining([expect.objectContaining({date:'2026-11-01',scaleWeightKg:79}),expect.objectContaining({date:'2026-11-12'})])}));});
 it('ignores a delayed connection after logout',async()=>{let resolve!:()=>void;vi.mocked(cloudSyncService.connect).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const hydration=useNutritionStore.getState().initializeForUser(owner);for(let i=0;i<10&&!resolve;i++)await Promise.resolve();expect(resolve).toBeDefined();useNutritionStore.getState().clearActiveSessionState();resolve();await hydration;expect(useNutritionStore.getState().activeUserId).toBeNull();expect(useNutritionStore.getState().userProfile).toBeNull();});
});
''')
