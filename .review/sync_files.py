from pathlib import Path
files = {}
files['src/services/sync/engine.ts'] = r'''import { generateUuid } from '../../lib/ids';
export const KINDS = ['profile','biometric','food','recipe','exercise','timeline','checkin','routine','session','preferences'] as const;
export type EntityKind = typeof KINDS[number];
export interface Document { kind: EntityKind; key: string; value: Record<string, unknown> | null; version: number }
export interface Change { kind: EntityKind; key: string; value: Record<string, unknown> | null; expectedVersion?: number; previous?: Record<string, unknown> | null }
export interface Operation extends Change { id: string; baseVersion: number; attempts: number; retryAt: number; conflict?: Document }
export interface Journal { schema: 1; imported: boolean; documents: Record<string, Document>; operations: Operation[] }
export interface JournalStorage { transaction<T>(work: (journal: Journal) => Promise<T>): Promise<T> }
export interface SyncGateway { pull(): Promise<Document[]>; push(op: Operation): Promise<{status:'applied'|'conflict';document:Document}> }
export const documentId = (entry: Pick<Change,'kind'|'key'>): string => `${entry.kind}:${entry.key}`;
export const emptyJournal = (): Journal => ({schema:1,imported:false,documents:{},operations:[]});
export function materialize(journal: Journal): Document[] {
  const result = new Map(Object.entries(journal.documents));
  for (const op of journal.operations) result.set(documentId(op),{kind:op.kind,key:op.key,value:op.value,version:op.baseVersion});
  return [...result.values()];
}
export function sameValue(a: unknown,b: unknown): boolean {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])) : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
/** Operation IDs survive response loss. Nothing is acknowledged before durable storage. */
export class SyncEngine {
  constructor(private storage: JournalStorage,private gateway: SyncGateway,private now:()=>number=Date.now) {}
  async read():Promise<Journal> { return this.storage.transaction(async j=>structuredClone(j)); }
  async enqueue(changes:Change[]):Promise<void> {
    await this.storage.transaction(async j=>{
      for(const change of changes){
        const key=documentId(change);
        const previous=[...j.operations].reverse().find(op=>documentId(op)===key);
        if(previous && sameValue(previous.value,change.value)) continue;
        const baseVersion=previous ? previous.baseVersion+1 : change.expectedVersion ?? j.documents[key]?.version ?? 0;
        const conflict=previous && change.previous!==undefined && !sameValue(previous.value,change.previous)
          ? {kind:previous.kind,key:previous.key,value:previous.value,version:baseVersion}:undefined;
        j.operations.push({...structuredClone(change),id:generateUuid(),baseVersion,attempts:0,retryAt:0,conflict});
      }
    });
  }
  async bootstrap(legacy:Change[]):Promise<void> {
    const remote=await this.gateway.pull();
    await this.storage.transaction(async j=>{
      if(j.imported) return;
      for(const doc of remote) j.documents[documentId(doc)]=doc;
      for(const change of legacy){
        const previous=[...j.operations].reverse().find(op=>documentId(op)===documentId(change));
        const current=previous ? {kind:previous.kind,key:previous.key,value:previous.value,version:previous.baseVersion+1}:j.documents[documentId(change)];
        if(current?.value===null || (current && sameValue(current.value,change.value))) continue;
        const op:Operation={...structuredClone(change),id:generateUuid(),baseVersion:0,attempts:0,retryAt:0};
        if(current) op.conflict=current;
        j.operations.push(op);
      }
      j.imported=true;
    });
  }
  async synchronize(force=false):Promise<Journal> {
    return this.storage.transaction(async j=>{
      for(const doc of await this.gateway.pull()){
        const key=documentId(doc);
        if(doc.version >= (j.documents[key]?.version??0)) j.documents[key]=doc;
      }
      const blocked=new Set<string>();
      for(const op of [...j.operations]){
        const key=documentId(op);
        if(blocked.has(key)) continue;
        if(op.conflict && j.documents[key]) op.conflict=j.documents[key];
        if(op.conflict || (!force && op.retryAt>this.now())){ blocked.add(key); continue; }
        try {
          const response=await this.gateway.push(structuredClone(op));
          if(response.document.version >= (j.documents[key]?.version??0)) j.documents[key]=response.document;
          if(response.status==='conflict'){op.conflict=response.document;blocked.add(key);}
          else j.operations=j.operations.filter(candidate=>candidate.id!==op.id);
        } catch {
          op.attempts+=1;
          op.retryAt=this.now()+Math.min(300_000,1000*2**Math.min(op.attempts,8));
          blocked.add(key);
        }
      }
      return structuredClone(j);
    });
  }
  async resolve(id:string,choice:'local'|'remote'):Promise<void> {
    await this.storage.transaction(async j=>{
      const conflict=j.operations.find(op=>op.id===id && op.conflict);
      if(!conflict?.conflict)return;
      const key=documentId(conflict);
      const chain=j.operations.filter(op=>documentId(op)===key);
      const desired=chain[chain.length-1];
      j.operations=j.operations.filter(op=>documentId(op)!==key);
      j.documents[key]=conflict.conflict;
      if(choice==='local')j.operations.push({kind:desired.kind,key:desired.key,value:desired.value,id:generateUuid(),baseVersion:conflict.conflict.version,attempts:0,retryAt:0});
    });
  }
}
'''
files['src/services/sync/browserStorage.ts'] = r'''import { get,set } from 'idb-keyval';
import { emptyJournal,type Journal,type JournalStorage } from './engine';
/** IndexedDB is authoritative; Web Locks serialize all tabs of one account. */
export function browserJournal(userId:string):JournalStorage {
  const key=`fitnutricion-sync-v1:${userId}`;
  return {async transaction<T>(work:(journal:Journal)=>Promise<T>):Promise<T>{
    if(typeof indexedDB==='undefined'||typeof navigator==='undefined'||!navigator.locks)throw new Error('La sincronización requiere IndexedDB, HTTPS y Web Locks.');
    return navigator.locks.request(key,async()=>{
      const stored=await get<Journal>(key);
      if(stored&&(stored.schema!==1||!Array.isArray(stored.operations)||!stored.documents))throw new Error('Cola incompatible. Conserva una copia antes de migrar.');
      const journal=stored??emptyJournal();const result=await work(journal);await set(key,journal);return result;
    });
  }};
}
'''
files['src/services/sync/gateway.ts'] = r'''import type { SupabaseClient } from '@supabase/supabase-js';
import { KINDS,type Document,type EntityKind,type SyncGateway } from './engine';
export function parseDocument(value:unknown):Document{
  if(!value||typeof value!=='object')throw new Error('Respuesta remota inválida.');
  const row=value as Record<string,unknown>;
  if(!KINDS.includes(row.kind as EntityKind)||typeof row.entity_key!=='string'||!Number.isSafeInteger(row.version)||Number(row.version)<0||(row.payload!==null&&(typeof row.payload!=='object'||Array.isArray(row.payload))))throw new Error('Contrato remoto inválido.');
  return {kind:row.kind as EntityKind,key:row.entity_key,version:Number(row.version),value:row.payload as Record<string,unknown>|null};
}
export function supabaseGateway(client:SupabaseClient,userId:string):SyncGateway{
  return {async pull(){
    const records:Document[]=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await client.from('sync_documents').select('kind,entity_key,payload,version').eq('user_id',userId).order('kind').order('entity_key').range(offset,offset+499).abortSignal(AbortSignal.timeout(10000));
      if(error)throw error;if(!Array.isArray(data))throw new Error('Respuesta incompleta.');
      records.push(...data.map(parseDocument));if(data.length<500)return records;
    }
  },async push(operation){
    const {data,error}=await client.rpc('apply_sync_operation',{p_operation_id:operation.id,p_kind:operation.kind,p_entity_key:operation.key,p_expected_version:operation.baseVersion,p_payload:operation.value}).abortSignal(AbortSignal.timeout(10000));
    if(error)throw error;if(!data||!['applied','conflict'].includes(data.status))throw new Error('Confirmación inválida.');
    return {status:data.status,document:parseDocument(data.document)};
  }};
}
'''
files['src/services/sync/snapshot.ts'] = r'''import type { PersistedUserSnapshot } from '../../store/useNutritionStore';
import { sameValue,documentId,type Change,type Document } from './engine';
const collections={biometric:'biometricLogs',food:'customFoods',recipe:'customRecipes',exercise:'customExercises',timeline:'timelineLogs',checkin:'metabolicCheckins',routine:'workoutRoutines',session:'workoutSessions'} as const;
export function snapshotDocuments(snapshot:PersistedUserSnapshot):Change[]{
  const result:Change[]=[];
  if(snapshot.userProfile)result.push({kind:'profile',key:snapshot.userProfile.id,value:{...snapshot.userProfile}});
  for(const [kind,field]of Object.entries(collections) as [keyof typeof collections,typeof collections[keyof typeof collections]][]){
    for(const item of snapshot[field]){const value={...item} as Record<string,unknown>;result.push({kind,key:String(kind==='biometric'?value.date:value.id),value});}
  }
  result.push({kind:'preferences',key:'favorites',value:{favoriteFoodIds:snapshot.favoriteFoodIds}});return result;
}
export function diffDocuments(before:Change[],after:Change[]):Change[]{
  const prev=new Map(before.map(doc=>[documentId(doc),doc]));const next=new Map(after.map(doc=>[documentId(doc),doc]));const changes:Change[]=[];
  for(const[key,doc]of next)if(!prev.has(key)||!sameValue(prev.get(key)?.value,doc.value))changes.push({...doc,previous:prev.get(key)?.value??null});
  for(const[key,doc]of prev)if(!next.has(key)&&doc.value!==null)changes.push({...doc,value:null,previous:doc.value});
  return changes;
}
export function applyDocuments(snapshot:PersistedUserSnapshot,docs:Document[]):PersistedUserSnapshot{
  const next:PersistedUserSnapshot={...snapshot,userProfile:null,biometricLogs:[],customFoods:[],customRecipes:[],customExercises:[],timelineLogs:[],metabolicCheckins:[],workoutRoutines:[],workoutSessions:[],deletedRecordIds:[]};
  for(const doc of docs){
    if(doc.value===null){next.deletedRecordIds.push(doc.key);continue;}
    if(doc.kind==='profile')next.userProfile=doc.value as unknown as PersistedUserSnapshot['userProfile'];
    else if(doc.kind==='preferences')next.favoriteFoodIds=Array.isArray(doc.value.favoriteFoodIds)?doc.value.favoriteFoodIds.filter((id):id is string=>typeof id==='string'):[];
    else (next[collections[doc.kind]] as unknown as Record<string,unknown>[]).push(doc.value);
  }
  next.biometricLogs.sort((a,b)=>a.date.localeCompare(b.date));next.workoutSessions.sort((a,b)=>b.date.localeCompare(a.date));next.metabolicCheckins.sort((a,b)=>b.weekDate.localeCompare(a.weekDate));return next;
}
'''
files['src/services/cloudSyncService.ts'] = r'''import { supabase } from './supabaseClient';
import { legacyCloudReader } from './legacyCloudReader';
import { browserJournal } from './sync/browserStorage';
import { supabaseGateway } from './sync/gateway';
import { SyncEngine,materialize,documentId,type Change,type Journal } from './sync/engine';
import { snapshotDocuments,diffDocuments,applyDocuments } from './sync/snapshot';
import { reportCloudFailure,reportLocalFailure,useSyncStatusStore } from '../store/useSyncStatusStore';
import type { PersistedUserSnapshot } from '../store/useNutritionStore';
import type { AuthenticatedUser } from './authService';
import { INITIAL_FOOD_ITEMS,INITIAL_RECIPES } from '../data/seedData';
export { generateUuid } from '../lib/ids';
export { isSeedRecordId,isValidUuid } from './legacyCloudReader';
type Connection={userId:string;engine:SyncEngine;snapshot:PersistedUserSnapshot;view:Change[];versions:Record<string,number>;publish:(s:PersistedUserSnapshot)=>void;revision:number;chain:Promise<void>;dispose:()=>void};
let active:Connection|null=null;
function report(j:Journal):void{
  const conflicts=j.operations.filter(op=>op.conflict);
  useSyncStatusStore.setState({pendingOperations:j.operations.length,conflicts:conflicts.length,conflictItems:conflicts.map(op=>({id:op.id,kind:op.kind,key:op.key})),lastError:j.operations.some(op=>op.attempts>0)?'Hay operaciones pendientes de reintento. No borres los datos de este dispositivo.':null,lastSyncedAt:j.operations.length===0?new Date().toISOString():useSyncStatusStore.getState().lastSyncedAt});
}
async function prepare(c:Connection):Promise<void>{
  if((await c.engine.read()).imported)return;
  const s=c.snapshot;
  const legacy=await legacyCloudReader.fetchUserCloudData(c.userId,[...s.customFoods,...INITIAL_FOOD_ITEMS],[...s.customRecipes,...INITIAL_RECIPES]);
  if(!legacy)throw new Error('No se confirmó la lectura del historial anterior.');
  const legacySnapshot={...s,...legacy,customRecipes:[],customExercises:[],favoriteFoodIds:[]};
  const deleted=new Set(s.deletedRecordIds);
  const fromCloud=snapshotDocuments(legacySnapshot).filter(d=>d.kind!=='preferences').map(d=>deleted.has(d.key)?{...d,value:null}:d);
  await c.engine.bootstrap([...fromCloud,...snapshotDocuments(c.snapshot)]);
}
async function refresh(c:Connection,force=false):Promise<void>{
  if(active!==c)return;const revision=c.revision;useSyncStatusStore.setState({pendingWrites:1});
  try{
    await prepare(c);if(active!==c)return;const journal=await c.engine.synchronize(force);if(active!==c)return;report(journal);
    if(revision!==c.revision)return;
    const docs=materialize(journal);const snapshot=applyDocuments(c.snapshot,docs);c.snapshot=snapshot;c.view=snapshotDocuments(snapshot);c.versions=Object.fromEntries(docs.map(d=>[documentId(d),d.version]));c.publish(snapshot);
  }catch{if(active===c)reportCloudFailure();}finally{if(active===c)useSyncStatusStore.setState({pendingWrites:0});}
}
function schedule(c:Connection,work:()=>Promise<void>):Promise<void>{c.chain=c.chain.then(work).catch(()=>{if(active===c)reportLocalFailure();});return c.chain;}
export const cloudSyncService={
  async connect(user:AuthenticatedUser,snapshot:PersistedUserSnapshot,publish:Connection['publish']):Promise<void>{
    this.disconnect();if(!supabase||user.authMode!=='cloud')return;
    const c:Connection={userId:user.id,snapshot,view:snapshotDocuments(snapshot),versions:{},publish,engine:new SyncEngine(browserJournal(user.id),supabaseGateway(supabase,user.id)),revision:0,chain:Promise.resolve(),dispose:()=>undefined};active=c;
    const retry=()=>{if(active===c)void schedule(c,()=>refresh(c));};
    if(typeof window!=='undefined'){
      const timer=window.setInterval(retry,30000);window.addEventListener('online',retry);document.addEventListener('visibilitychange',retry);
      c.dispose=()=>{window.clearInterval(timer);window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry);};
    }
    await schedule(c,()=>refresh(c,true));
  },
  capture(userId:string,snapshot:PersistedUserSnapshot):void{
    const c=active;if(!c||c.userId!==userId)return;
    const next=snapshotDocuments(snapshot);const changes=diffDocuments(c.view,next).map(d=>({...d,expectedVersion:c.versions[documentId(d)]??0}));c.snapshot=snapshot;c.view=next;
    if(!changes.length)return;c.revision+=1;
    void schedule(c,async()=>{await c.engine.enqueue(changes);if(active!==c)return;report(await c.engine.read());await refresh(c);});
  },
  async retry():Promise<void>{if(active){const c=active;await schedule(c,()=>refresh(c,true));}},
  async resolveConflict(id:string,choice:'local'|'remote'):Promise<void>{if(!active)return;const c=active;c.revision+=1;await schedule(c,async()=>{await c.engine.resolve(id,choice);await refresh(c,true);});},
  async drain():Promise<void>{await active?.chain;},
  disconnect():void{active?.dispose();active=null;},
};
'''
# Capture the legacy reader BEFORE replacing its original implementation.
p=Path('src/services/cloudSyncService.ts')
s=p.read_text()
assert 'async upsertUserProfile' in s
s=s[:s.index('  /**\n   * Sincroniza `user_profiles`')]+'};\n'
s=s.replace("import { cloudWrite, type SyncResult } from './cloudOperation';\n",'')
a=s.index('  /**\n   * Invoca la regla');b=s.index('  /**\n   * Descarga y reconstruye')
s=s[:a]+s[b:]
s=s.replace('      await this.purgeCloudSeedData(userId);\n','').replace('export const cloudSyncService =','export const legacyCloudReader =')
Path('src/services/legacyCloudReader.ts').write_text(s)
for name, content in files.items():
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
