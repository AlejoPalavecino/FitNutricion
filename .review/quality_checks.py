from pathlib import Path
import re

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
p=Path('src/components/onboarding/OnboardingDiagnostic.tsx');s=p.read_text().replace('<label className="mb-1.5 block text-sm font-semibold text-slate-700">\n                    Altura (cm)','<label htmlFor="onboardingdiagnostic-field-3" className="mb-1.5 block text-sm font-semibold text-slate-700">\n                    Altura (cm)');s=s.replace('<label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">\n                Experiencia entrenando fuerza\n              </label>','<p className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">\n                Experiencia entrenando fuerza\n              </p>');p.write_text(s)
p=Path('scripts/ingest-opengym.ts');s=p.read_text().replace('  let translated =','  const translated =');p.write_text(s)
p=Path('src/services/securityService.ts');s=p.read_text().replace("    .replace(/[\u0000-\u001F\u007F]/g, '')", "    // Control characters are deliberately removed from display names.\n    // eslint-disable-next-line no-control-regex\n    .replace(/[\u0000-\u001F\u007F]/g, '')");p.write_text(s)
p=Path('src/store/slices/nutrition.ts');s=p.read_text().replace('  addCustomFood: (foodData) => {\n    const state = get();','  addCustomFood: (foodData) => {').replace('    const state = get();\n    const updatedFood = state.foods.find((f) => f.id === foodId);','');p.write_text(s)
p=Path('src/store/slices/profile.ts');s=p.read_text().replace('    const latestBioEntry =\n      updatedBioLogs[updatedBioLogs.length - 1] ?? initialBioLog;','');p.write_text(s)
p=Path('src/store/slices/workouts.ts');s=p.read_text().replace('    const activeUserId = get().activeUserId;','').replace('    const state = get();\n    const updated = state.workoutRoutines.find((r) => r.id === routineId);','');p.write_text(s)
p=Path('src/store/useNutritionStore.ts');s=p.read_text().replace('initializeForUser: async (user, options)','initializeForUser: async (user, _options)').replace('    const isNewRegistration = Boolean(options?.isNewRegistration);','');p.write_text(s)
p=Path('src/store/useAuthStore.ts');s=p.read_text().replace('        currentUser: user,\n        isInitialized: true,',"        currentUser: user,\n        isRecovering: !!user && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('recovery') === '1',\n        isInitialized: true,")
s+='''
export function invalidateAuthSession(): void {
  authGeneration += 1;
  cloudSyncService.disconnect();
  useNutritionStore.getState().clearActiveSessionState();
  useAuthStore.setState({currentUser:null,isInitialized:true,isSubmitting:false,isRecovering:false});
}
''';p.write_text(s)
p=Path('src/services/authLifecycle.ts');s=p.read_text().replace("import { useAuthStore }","import { invalidateAuthSession, useAuthStore }").replace("import {useAuthStore}","import {invalidateAuthSession,useAuthStore}");s=s.replace("((event)=>{","((event, session)=>{")
s=s.replace("cloudSyncService.disconnect();useNutritionStore.getState().clearActiveSessionState();useAuthStore.setState({currentUser:null,isInitialized:true});","invalidateAuthSession();")
s=s.replace("   if(event==='SIGNED_OUT'){","   if(event==='SIGNED_IN' && session?.user.id !== useAuthStore.getState().currentUser?.id && !useAuthStore.getState().isSubmitting)void useAuthStore.getState().initializeAuth();\n   if(event==='SIGNED_OUT'){")
p.write_text(s)
# Generic local read/write failures must not overwrite durable prior copies silently.
write('src/lib/storage.ts',r'''import {del,get,set} from 'idb-keyval';
import type {StateStorage} from 'zustand/middleware';
interface Envelope {format:'fitnutricion-storage-v1';revision:number;value:string}
let clock=0;
function unpack(raw:string|null|undefined):{revision:number;value:string}|null{
 if(raw==null)return null;
 try{const value=JSON.parse(raw);if(value?.format==='fitnutricion-storage-v1'&&Number.isFinite(value.revision)&&typeof value.value==='string')return value;}catch{/* Legacy payloads are validated during hydration. */}
 return {revision:0,value:raw};
}
export const offlineFirstStorage:StateStorage={
 async getItem(name){
  let local:ReturnType<typeof unpack>=null,remote:ReturnType<typeof unpack>=null;
  try{if(typeof localStorage!=='undefined')local=unpack(localStorage.getItem(name));}catch{/* Try IndexedDB independently. */}
  try{if(typeof indexedDB!=='undefined')remote=unpack(await get<string>(name));}catch{/* Local mirror may still be durable. */}
  const latest=local&&remote?(local.revision>=remote.revision?local:remote):local??remote;
  clock=Math.max(clock,latest?.revision??0);return latest?.value??null;
 },
 async setItem(name,value){
  clock=Math.max(Date.now(),clock+1);const envelope:Envelope={format:'fitnutricion-storage-v1',revision:clock,value};const encoded=JSON.stringify(envelope);let stored=false;
  try{if(typeof localStorage!=='undefined'){localStorage.setItem(name,encoded);stored=true;}}catch{/* IndexedDB may still accept a larger snapshot. */}
  try{if(typeof indexedDB!=='undefined'){await set(name,encoded);stored=true;}}catch{/* Notify when both stores fail. */}
  if(!stored)throw new Error('No durable browser storage is available.');
 },
 async removeItem(name){
  let failed=false;try{if(typeof localStorage!=='undefined')localStorage.removeItem(name);}catch{failed=true;}
  try{if(typeof indexedDB!=='undefined')await del(name);}catch{failed=true;}
  if(failed)throw new Error('No se pudieron borrar todas las copias.');
 },
};
''')
# Complete required schemas used by JSX and arithmetic, not only their IDs.
p=Path('src/domain/validation.ts');s=p.read_text().replace("recipe:z.object({id,name:z.string(),ingredients:","recipe:z.object({id,name:z.string(),description:z.string(),instructions:z.array(z.string()),tags:z.array(z.string()),ingredients:")
s=s.replace('ewmaAlpha:number.min(.1)',"phaseAdjustmentPercent:number,bmrKcal:number.positive(),bmrFormulaUsed:z.enum(['katch_mcardle','mifflin_st_jeor']),targetFiberG:nonnegative,targetWaterMl:nonnegative,ewmaAlpha:number.min(.1)")
s=s.replace('estimatedBfPercent:nonnegative,lbmKg:',"estimatedBfPercent:nonnegative,bfMethod:z.enum(['us_navy','boer_fallback']),lbmKg:")
s=s.replace('defaultServingName:z.string(),defaultServingGrams:number.positive()', 'fiberPer100g:nonnegative,isCustom:z.boolean(),isFavorite:z.boolean(),defaultServingName:z.string(),defaultServingGrams:number.positive()')
s=s.replace('previousTdee:number.positive(),appliedTdee:', 'weightSlopeKgPerWeek:number,calculatedRealTdee:number.positive(),previousTdee:number.positive(),appliedTdee:');p.write_text(s)
write('src/services/sync/inbox.test.ts',r'''import {describe,it,expect,vi,afterEach} from 'vitest';
import {stageChanges,recoverInbox} from './inbox';
import {SyncEngine,emptyJournal,type JournalStorage} from './engine';
function storage(){const data=new Map<string,string>();return {get length(){return data.size;},getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);},key:(i:number)=>[...data.keys()][i]??null,clear:()=>data.clear()} satisfies Storage;}
function engine(){const j=emptyJournal();const store:JournalStorage={async transaction(work){return work(j);}};return new SyncEngine(store,{pull:async()=>[],push:async()=>{throw new Error('offline');}});}
const change=(name:string)=>({kind:'food' as const,key:'same',value:{name}});
afterEach(()=>vi.restoreAllMocks());
describe('crash-safe synchronous inbox',()=>{
 it('recovers edits made before async journal persistence could run',async()=>{const disk=storage(),e=engine();stageChanges('A',[change('first')],disk);stageChanges('A',[change('second')],disk);expect(disk.length).toBe(2);await recoverInbox('A',e,disk);expect((await e.read()).operations.map(o=>o.value?.name)).toEqual(['first','second']);expect(disk.length).toBe(0);});
 it('does not duplicate a batch after a crash between journal commit and inbox deletion',async()=>{const disk=storage(),e=engine();stageChanges('A',[change('one')],disk);const real=disk.removeItem;disk.removeItem=()=>{throw new Error('crash');};await expect(recoverInbox('A',e,disk)).rejects.toThrow();disk.removeItem=real;await recoverInbox('A',e,disk);expect((await e.read()).operations).toHaveLength(1);});
 it('never drains another account inbox',async()=>{const disk=storage(),e=engine();stageChanges('A',[change('A')],disk);stageChanges('B',[change('B')],disk);await recoverInbox('A',e,disk);expect(disk.length).toBe(1);expect((await e.read()).operations[0].value?.name).toBe('A');});
 it('reports storage quota failures synchronously',()=>{const disk=storage();disk.setItem=()=>{throw new Error('quota');};expect(()=>stageChanges('A',[change('A')],disk)).toThrow('quota');});
 it('keeps invalid inbox contents for diagnosis instead of discarding them',async()=>{const disk=storage(),e=engine();disk.setItem('fitnutricion-sync-inbox-v1:A:bad','not-json');await expect(recoverInbox('A',e,disk)).rejects.toThrow();expect(disk.length).toBe(1);});
});
''')
write('src/lib/storage.test.ts',r'''import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {indexedDB} from 'fake-indexeddb';
import {set,clear} from 'idb-keyval';
import {offlineFirstStorage} from './storage';
let data:Map<string,string>;
beforeEach(async()=>{data=new Map();vi.stubGlobal('indexedDB',indexedDB);vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});await clear();});
afterEach(()=>vi.unstubAllGlobals());
it('prefers the newer durable mirror after interrupted IndexedDB write',async()=>{const key='health';await set(key,JSON.stringify({format:'fitnutricion-storage-v1',revision:1,value:'old'}));data.set(key,JSON.stringify({format:'fitnutricion-storage-v1',revision:2,value:'new'}));expect(await offlineFirstStorage.getItem(key)).toBe('new');});
it('accepts legacy snapshots and removes both copies',async()=>{data.set('health','{"legacy":true}');expect(await offlineFirstStorage.getItem('health')).toBe('{"legacy":true}');await offlineFirstStorage.setItem('health','updated');expect(await offlineFirstStorage.getItem('health')).toBe('updated');await offlineFirstStorage.removeItem('health');expect(await offlineFirstStorage.getItem('health')).toBeNull();});
''')
write('src/config/env.test.ts',r'''import {describe,it,expect} from 'vitest';
import {parseEnvironment} from './env';
describe('explicit deployment configuration',()=>{
 it('requires an explicit production mode',()=>{expect(parseEnvironment({},true).configurationError).not.toBeNull();expect(parseEnvironment({VITE_AUTH_MODE:'local'},true).configurationError).toBeNull();});
 it('does not silently switch a broken cloud deployment to local',()=>{const c=parseEnvironment({VITE_AUTH_MODE:'cloud'},true);expect(c.authMode).toBe('cloud');expect(c.configurationError).not.toBeNull();expect(c.isCloudConfigured).toBe(false);});
 it('rejects privileged secrets in the browser bundle',()=>{expect(parseEnvironment({VITE_AUTH_MODE:'cloud',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'sb_secret_never_publish_this_key'},true).isCloudConfigured).toBe(false);});
});
''')
write('src/domain/validation.test.ts',r'''import {describe,it,expect} from 'vitest';
import {parseEntity,snapshotSchema} from './validation';
import {INITIAL_FOOD_ITEMS,INITIAL_RECIPES} from '../data/seedData';
describe('runtime contracts',()=>{
 it('accepts actual food and recipe catalogs',()=>{for(const f of INITIAL_FOOD_ITEMS)expect(parseEntity('food',f)).toEqual(f);for(const r of INITIAL_RECIPES)expect(parseEntity('recipe',r)).toEqual(r);});
 it('rejects invalid macros and impossible dates before hydration',()=>{expect(()=>parseEntity('timeline',{id:'a',date:'2026-02-30',hour:12,gramsConsumed:100,calculatedMacros:{kcal:NaN}})).toThrow();expect(()=>snapshotSchema.parse({biometricLogs:[{id:'bad'}]})).toThrow();});
 it('accepts tombstones and forward-compatible metadata',()=>{expect(parseEntity('food',null)).toBeNull();expect(parseEntity('food',{...INITIAL_FOOD_ITEMS[0],futureField:'kept'})?.futureField).toBe('kept');});
});
''')
