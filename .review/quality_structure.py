from pathlib import Path
import re
p=Path('src/store/useNutritionStore.ts');s=p.read_text()
header=s[:s.index('export interface CompleteOnboardingPayload')]
header=header.replace("from '../", "from '../../")
extra="import type {StoreApi} from 'zustand';\nimport type {NutritionState} from '../useNutritionStore';\nimport {localDate as getTodayIso} from '../../lib/dates';\n"
# Extract contiguous action groups without changing their implementations.
for label,start,end in [('Profile','  completeOnboarding: (payload) => {','  setSelectedDate: (date) =>'),('Nutrition','  setSelectedDate: (date) =>','  // ======================================================================\n  // ACCIONES FASE 5'),('Workouts','  saveWorkoutRoutine: (routine) => {','\n}));')]:
 a=s.index(start,s.index('export const useNutritionStore'));b=s.index(end,a)
 actions=s[a:b];names=re.findall(r'^  (\w+):',actions,re.M)
 folder=Path('src/store/slices');folder.mkdir(exist_ok=True)
 text=header+extra+f"\nexport function create{label}Actions(set:StoreApi<NutritionState>['setState'],get:StoreApi<NutritionState>['getState'],persistCurrentUserState:(state:NutritionState)=>void):Pick<NutritionState,"+' | '.join(repr(n) for n in names)+"> {\nreturn {\n"+actions+'\n};\n}\n'
 (folder/(label.lower()+'.ts')).write_text(text)
 s=s[:a]+f'  ...create{label}Actions(set,get,persistCurrentUserState),\n'+s[b:]
 s=f"import {{create{label}Actions}} from './slices/{label.lower()}';\n"+s
p.write_text(s)
# Isolate ticking state so the entire exercise catalog does not render twice a second.
p=Path('src/components/gym/OpenGymHub.tsx');s=p.read_text()
a=s.index('function playRestTimerBeep()');b=s.index('export const OpenGymHub',a);beep=s[a:b].replace('    osc.stop(ctx.currentTime + 0.45);','    osc.stop(ctx.currentTime + 0.45);\n    osc.onended = () => { void ctx.close(); };')
s=s[:a]+s[b:]
a=s.index('  // Temporizador de descanso');b=s.index('  const handleCycleSetType',a);logic=s[a:b]
start=logic.index('  const startRestTimer =');end=logic.index('  const adjustRestTimer',start)
startcode=logic[start:end].replace('  const startRestTimer =','export const startRestTimer =').replace('    setRestTimerRemaining(seconds);','').replace('    setActiveWorkoutDraft((prev) =>','    useNutritionStore.getState().setActiveWorkoutDraft((prev) =>')
logic=logic[:start]+logic[end:]
s=s[:a]+s[b:]
a=s.index('      {/* ====================================================================\n          BARRA FLOTANTE:');b=s.index('\n    </div>\n  );\n};',a)
jsx=s[a:b];s=s[:a]+'      <RestTimer/>\n'+s[b:]
s="import { RestTimer, startRestTimer } from './RestTimer';\n"+s;p.write_text(s)
Path('src/components/gym/RestTimer.tsx').write_text("import {useEffect,useState} from 'react';\nimport {AnimatePresence,motion} from 'framer-motion';\nimport {SkipForward} from 'lucide-react';\nimport {useNutritionStore} from '../../store/useNutritionStore';\n"+beep+startcode+"\nexport function RestTimer(){\n const activeWorkoutDraft=useNutritionStore(s=>s.activeWorkoutDraft);\n const setActiveWorkoutDraft=useNutritionStore(s=>s.setActiveWorkoutDraft);\n"+logic+'\n return <>\n'+jsx+'\n</>;\n}\n')
# Paged legacy import: do not silently lose history beyond the API page size.
p=Path('src/services/legacyCloudReader.ts');s=p.read_text();a=s.index('      const [\n        profileRes,');b=s.index('\n      const responses =',a)
s=s[:a]+'''      const readAll = async (table:string, columns:string, ownerColumn='user_id') => {
        const rows:Record<string,any>[]=[];
        for(let offset=0;;offset+=500){
          const result=await supabase.from(table).select(columns).eq(ownerColumn,userId).order('id').range(offset,offset+499).abortSignal(AbortSignal.timeout(10000));
          if(result.error)return {data:null,error:result.error};
          const data=result.data as unknown as Record<string,any>[];
          rows.push(...data);if(data.length<500)return {data:rows,error:null};
        }
      };
      const [profileRes,bioRes,customFoodsRes,tlRes,checkinsRes,routinesRes,sessionsRes]=await Promise.all([
        supabase.from('user_profiles').select('*').eq('id',userId).maybeSingle().abortSignal(AbortSignal.timeout(10000)),
        readAll('biometric_logs','*'),readAll('food_items','*','owner_user_id'),readAll('timeline_logs','*'),readAll('metabolic_checkins','*'),
        readAll('workout_routines','*, workout_routine_days(day_of_week), workout_routine_exercises(*)'),
        readAll('workout_sessions','*, workout_set_logs(*)'),
      ]);
      if(bioRes.data)bioRes.data.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
'''+s[b:];p.write_text(s)
# Order durable inbox batches and make duplicate delivery harmless.
p=Path('src/services/sync/inbox.ts');s=p.read_text().replace('/** A separate','let lastSequence=0;\n/** A separate').replace('  storage.setItem(prefix(userId)+batch.id,JSON.stringify(batch));','  lastSequence=Math.max(lastSequence+1,Date.now());\n  storage.setItem(prefix(userId)+String(lastSequence).padStart(16,\'0\')+\':\'+batch.id,JSON.stringify(batch));').replace('if(key!==prefix(userId)+batch.id)','if(!key.endsWith(\':\'+batch.id))');p.write_text(s)
# TypeScript organizes imports without changing runtime behavior, then the compiler checks extracted slices.
Path('scripts/organize-imports.cjs').write_text(r'''const ts=require('typescript'),fs=require('fs');
const config=ts.readConfigFile('tsconfig.app.json',ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd());
const files=parsed.fileNames,host={getScriptFileNames:()=>files,getScriptVersion:()=>"0",getScriptSnapshot:f=>fs.existsSync(f)?ts.ScriptSnapshot.fromString(fs.readFileSync(f,'utf8')):undefined,getCurrentDirectory:()=>process.cwd(),getCompilationSettings:()=>parsed.options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
const service=ts.createLanguageService(host);
for(const file of files){let text=fs.readFileSync(file,'utf8');const changes=service.organizeImports({type:'file',fileName:file},{},{});for(const change of changes)for(const edit of [...change.textChanges].sort((a,b)=>b.span.start-a.span.start))text=text.slice(0,edit.span.start)+edit.newText+text.slice(edit.span.start+edit.span.length);fs.writeFileSync(file,text);}
''')
