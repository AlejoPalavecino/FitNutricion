import { supabase } from './supabaseClient';
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
