from pathlib import Path

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
def patch(name,old,new):
 p=Path(name);s=p.read_text();assert old in s,(name,old[:80]);p.write_text(s.replace(old,new))
write('src/services/sync/inbox.ts',r'''import { generateUuid } from '../../lib/ids';
import type { Change, SyncEngine } from './engine';
import { z } from 'zod';
import { KINDS } from './engine';
const batchSchema = z.object({ id: z.string().uuid(), changes: z.array(z.object({
  kind: z.enum(KINDS), key: z.string().min(1).max(200), value: z.record(z.string(),z.unknown()).nullable(),
  expectedVersion: z.number().int().nonnegative().optional(), previous: z.record(z.string(),z.unknown()).nullable().optional(),
})).max(10000) });
const prefix=(userId:string)=>`fitnutricion-sync-inbox-v1:${userId}:`;
/** A separate synchronous key per mutation batch avoids cross-tab read/modify/write races. */
export function stageChanges(userId:string,changes:Change[],storage:Storage=localStorage):void{
  const batch={id:generateUuid(),changes};
  storage.setItem(prefix(userId)+batch.id,JSON.stringify(batch));
}
export async function recoverInbox(userId:string,engine:SyncEngine,storage:Storage=localStorage):Promise<void>{
  const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((key):key is string=>!!key?.startsWith(prefix(userId))).sort();
  for(const key of keys){
    const raw=storage.getItem(key);if(!raw)continue;
    const batch=batchSchema.parse(JSON.parse(raw));
    if(key!==prefix(userId)+batch.id)throw new Error('Identificador de cola inválido.');
    await engine.enqueueBatch(batch.id,batch.changes);
    storage.removeItem(key);
    // Keep the receipt until every tab has finished replaying this batch.
    // Receipts are small IDs; retention is explicit, not a time-based guess.
  }
}
''')
p=Path('src/services/sync/engine.ts');s=p.read_text().replace('schema: 1; imported: boolean;','schema: 1; imported: boolean; acceptedBatches?: string[];')
s=s.replace('  async enqueue(changes:Change[]):Promise<void> {','  async enqueue(changes:Change[]):Promise<void> { return this.enqueueBatch(generateUuid(), changes); }\n  async enqueueBatch(batchId:string,changes:Change[]):Promise<void> {')
s=s.replace('    await this.storage.transaction(async j=>{\n      for(const change of changes){','    await this.storage.transaction(async j=>{\n      if(j.acceptedBatches?.includes(batchId))return;\n      j.acceptedBatches=[...(j.acceptedBatches??[]),batchId];\n      for(const change of changes){',1);p.write_text(s)
p=Path('src/services/cloudSyncService.ts');s="import { stageChanges, recoverInbox } from './sync/inbox';\n"+p.read_text()
s=s.replace('    await prepare(c);','    await recoverInbox(c.userId,c.engine);\n    await prepare(c);')
s=s.replace('    if(!changes.length)return;c.revision+=1;\n    void schedule(c,async()=>{await c.engine.enqueue(changes);if(active!==c)return;report(await c.engine.read());await refresh(c);});','    if(!changes.length)return;c.revision+=1;\n    try { stageChanges(userId,changes); } catch { reportLocalFailure(); return; }\n    void schedule(c,async()=>{await recoverInbox(userId,c.engine);if(active!==c)return;report(await c.engine.read());await refresh(c);});')
p.write_text(s)
p=Path('src/services/securityService.ts');s=p.read_text().replace('  let failed = false;','''  let failed = false;
  try {
    if(typeof localStorage !== 'undefined') for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i);
      if(key?.startsWith(`fitnutricion-sync-inbox-v1:${userId}:`)) localStorage.removeItem(key);
    }
  } catch { failed=true; }''');p.write_text(s)
write('src/domain/validation.ts',r'''import { z } from 'zod';
import { isCivilDate } from '../lib/dates';
import type { EntityKind } from '../services/sync/engine';
const id=z.string().min(1).max(200),number=z.number().finite(),nonnegative=number.nonnegative();
const date=z.string().refine(isCivilDate),strings=z.array(id).max(10000);
const macros=z.object({kcal:nonnegative,proteinG:nonnegative,carbsG:nonnegative,fatG:nonnegative,fiberG:nonnegative}).passthrough();
const set=z.object({id,exerciseId:id,setNumber:number.int().positive(),setType:z.enum(['warmup','working','dropset','failure']),weightKg:nonnegative,reps:nonnegative.int(),isCompleted:z.boolean(),estimated1RM:nonnegative}).passthrough();
const schemas={
 profile:z.object({id,name:z.string(),birthDate:date,sex:z.enum(['male','female']),heightCm:number.positive(),initialPal:number.positive(),trainingExperience:z.enum(['novice','intermediate','advanced']),currentPhase:z.enum(['cut','recomp','maintenance','bulk']),activeTdee:number.positive(),targetKcal:number.positive(),targetProteinG:nonnegative,targetCarbsG:nonnegative,targetFatG:nonnegative,ewmaAlpha:number.min(.1).max(.15),onboardingCompleted:z.boolean(),updatedAt:z.string()}).passthrough(),
 biometric:z.object({id,date,scaleWeightKg:number.positive(),trendWeightKg:number.positive(),estimatedBfPercent:nonnegative,lbmKg:nonnegative,fatMassKg:nonnegative}).passthrough(),
 food:z.object({id,name:z.string(),kcalPer100g:nonnegative,proteinPer100g:nonnegative,carbsPer100g:nonnegative,fatPer100g:nonnegative,defaultServingName:z.string(),defaultServingGrams:number.positive()}).passthrough(),
 recipe:z.object({id,name:z.string(),ingredients:z.array(z.object({foodId:id,grams:number.positive()})).max(500),totalMacros:macros.extend({totalGrams:number.positive()})}).passthrough(),
 exercise:z.object({id,nameEs:z.string(),nameEn:z.string(),aliases:strings,primaryMuscle:z.string(),secondaryMuscles:strings,equipment:z.string(),category:z.string(),images:z.array(z.string()).max(30),instructionsEs:z.array(z.string()).max(100)}).passthrough(),
 timeline:z.object({id,date,hour:number.int().min(0).max(23),gramsConsumed:number.positive(),calculatedMacros:macros}).passthrough(),
 checkin:z.object({id,weekDate:date,avgDailyIntakeKcal:nonnegative,previousTdee:number.positive(),appliedTdee:number.positive(),userApproved:z.boolean()}).passthrough(),
 routine:z.object({id,name:z.string(),assignedDays:z.array(number.int().min(0).max(6)).max(7),exercises:z.array(z.object({exerciseId:id,order:number.int().positive(),targetSets:number.int().positive(),targetRepRange:z.tuple([number.int().positive(),number.int().positive()]),targetRir:nonnegative,restSeconds:nonnegative,progressionRule:z.string()}).passthrough()).max(500)}).passthrough(),
 session:z.object({id,date,routineName:z.string(),startTime:z.string(),endTime:z.string(),durationMinutes:nonnegative,bodyweightKgAtSession:number.positive(),totalVolumeKg:nonnegative,sets:z.array(set).max(5000)}).passthrough(),
 preferences:z.object({favoriteFoodIds:strings,completedNutritionDates:z.array(date).max(100000).optional()}).passthrough(),
};
export function parseEntity(kind:EntityKind,value:unknown):Record<string,unknown>|null{return value===null?null:schemas[kind].parse(value);}
/** Validate persisted data before hydration. Invalid data remains on disk for recovery. */
export const snapshotSchema=z.object({
 userProfile:schemas.profile.nullable().optional(),biometricLogs:z.array(schemas.biometric).optional(),customFoods:z.array(schemas.food).optional(),customRecipes:z.array(schemas.recipe).optional(),customExercises:z.array(schemas.exercise).optional(),timelineLogs:z.array(schemas.timeline).optional(),metabolicCheckins:z.array(schemas.checkin).optional(),workoutRoutines:z.array(schemas.routine).optional(),workoutSessions:z.array(schemas.session).optional(),favoriteFoodIds:strings.optional(),deletedRecordIds:strings.optional(),completedNutritionDates:z.array(date).optional(),
 activeWorkoutDraft:z.object({routineId:id,startedAtIso:z.string(),setsByExercise:z.record(z.string(),z.array(set)),restTimerEndsAtMs:nonnegative.nullable(),restTimerTotalSeconds:nonnegative,restTimerExerciseName:z.string(),updatedAt:z.string()}).passthrough().nullable().optional(),
 routineEditorDraft:schemas.routine.nullable().optional(),onboardingDraft:z.record(z.string(),z.unknown()).nullable().optional(),
}).passthrough();
''')
p=Path('src/services/sync/gateway.ts');s="import { parseEntity } from '../../domain/validation';\n"+p.read_text();s=s.replace('value:row.payload as Record<string,unknown>|null','value:parseEntity(row.kind as EntityKind,row.payload)');s=s.replace('    const {data,error}=await client.rpc','    parseEntity(operation.kind,operation.value);\n    const {data,error}=await client.rpc');p.write_text(s)
p=Path('src/store/useNutritionStore.ts');s="import { snapshotSchema } from '../domain/validation';\n"+p.read_text();s=s.replace('JSON.parse(rawJson) as Partial<PersistedUserSnapshot>','snapshotSchema.parse(JSON.parse(rawJson)) as Partial<PersistedUserSnapshot>')
s=s.replace('    } catch {\n      localSnapshot = sanitizeSnapshot(null, user);\n    }','''    } catch {
      reportLocalFailure();
      throw new Error('Los datos locales no se pudieron validar. Se conservaron sin sobrescribir.');
    }''');p.write_text(s)
