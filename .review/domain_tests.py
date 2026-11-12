from pathlib import Path
Path('src/lib/domainRegression.test.ts').write_text(r'''import {afterEach,describe,expect,it,vi} from 'vitest';
import {localDate,addDays,daysBetween,weekStart,ageOn,isCivilDate} from './dates';
import {calculateAdaptiveTdee,calculateHierarchicalMacros,calculateTargetCaloriesForPhase} from './metabolism';
import {getDoubleProgressionSuggestion} from './strengthAnalytics';
import type {BiometricLog,WorkoutSession} from '../types/nutrition';
const weights:BiometricLog[]=Array.from({length:21},(_,i)=>({id:`b${i}`,date:addDays('2026-10-01',i),scaleWeightKg:82-i*.05,trendWeightKg:82-i*.05,estimatedBfPercent:18,bfMethod:'boer_fallback',lbmKg:67,fatMassKg:15}));
const intakes=weights.map(b=>({date:b.date,kcal:2400,isComplete:true}));
const input={biometricLogs:weights,dailyIntakes:intakes,previousTdee:2500,referenceDate:'2026-10-21'};
afterEach(()=>vi.unstubAllEnvs());
describe('civil calendar boundaries',()=>{
 it('uses the local evening date instead of tomorrow UTC',()=>{const date=new Date('2026-11-13T01:30:00Z');vi.spyOn(date,'getFullYear').mockReturnValue(2026);vi.spyOn(date,'getMonth').mockReturnValue(10);vi.spyOn(date,'getDate').mockReturnValue(12);expect(localDate(date)).toBe('2026-11-12');});
 it('handles leap years and week/year boundaries',()=>{expect(addDays('2024-02-28',1)).toBe('2024-02-29');expect(daysBetween('2026-03-07','2026-03-09')).toBe(2);expect(weekStart('2027-01-01')).toBe('2026-12-28');});
 it('rejects impossible and future births without inventing age',()=>{expect(isCivilDate('2026-02-30')).toBe(false);expect(()=>ageOn('2030-01-01','2026-11-12')).toThrow();expect(()=>ageOn('invalid')).toThrow();expect(ageOn('2000-11-13','2026-11-12')).toBe(25);});
});
describe('coherent energy budget',()=>{
 it('reports an incompatible budget and returns coherent energy',()=>{const m=calculateHierarchicalMacros({targetKcal:1200,weightKg:80,lbmKg:66,bfPercent:17.5,sex:'male',phase:'cut'});expect(m.kcal).toBe(1280);expect(m.kcal).toBe(m.proteinG*4+m.carbsG*4+m.fatG*9);expect(m.energyAdjustmentReason).toContain('1200');});
 it('preserves invariants over a grid of inputs',()=>{for(const targetKcal of [1000,1500,2200,3500])for(const weightKg of [45,80,150]){const m=calculateHierarchicalMacros({targetKcal,weightKg,lbmKg:weightKg*.8,bfPercent:20,sex:'male',phase:'cut'});expect(m.kcal).toBe(m.proteinG*4+m.carbsG*4+m.fatG*9);expect(m.carbsG).toBeGreaterThanOrEqual(0);}});
 it('rejects nonfinite values and reports the actual bounded delta',()=>{expect(()=>calculateHierarchicalMacros({targetKcal:NaN,weightKg:80,lbmKg:60,bfPercent:20,sex:'male',phase:'cut'})).toThrow();const p=calculateTargetCaloriesForPhase({activeTdee:1000,phase:'cut',fatMassKg:10});expect(p.deltaKcal).toBe(p.targetKcal-1000);});
});
describe('aligned adaptive windows',()=>{
 it('uses the same observed interval and excludes future data',()=>{expect(calculateAdaptiveTdee(input).calculatedRealTdee).toBe(2785);const future={...input,dailyIntakes:[...intakes,{date:'2026-10-22',kcal:9999,isComplete:true}],biometricLogs:[...weights,{...weights[0],date:'2026-10-22',trendWeightKg:120}]};expect(calculateAdaptiveTdee(future).calculatedRealTdee).toBe(2785);});
 it('does not treat a partial food log as complete',()=>{const r=calculateAdaptiveTdee({...input,dailyIntakes:intakes.map(d=>({...d,isComplete:false}))});expect(r.isReadyForAdaptive).toBe(false);expect(r.appliedTdee).toBe(2500);});
 it('does not compare months of weights against three weeks of food',()=>{expect(calculateAdaptiveTdee({...input,biometricLogs:[{...weights[0],date:'2026-01-01'},weights[20]]}).isReadyForAdaptive).toBe(false);});
 it('freezes adaptation for stale weigh-ins',()=>{expect(calculateAdaptiveTdee({...input,referenceDate:'2026-11-12'}).isReadyForAdaptive).toBe(false);});
});
it('does not unlock progression from one of three prescribed sets',()=>{const session:WorkoutSession={id:'s',date:'2026-11-12',startTime:'12:00',endTime:'13:00',durationMinutes:60,bodyweightKgAtSession:80,totalVolumeKg:800,sets:[{id:'set',exerciseId:'e',setNumber:1,setType:'working',weightKg:80,reps:10,isCompleted:true,isPrWeight:false,isPr1RM:false,estimated1RM:100}]};const r=getDoubleProgressionSuggestion({routineExercise:{exerciseId:'e',order:1,targetSets:3,targetRepRange:[6,10],targetRir:1,restSeconds:120,progressionRule:'double_progression'},previousSessions:[session]});expect(r.allWorkingSetsHitTopOfRange).toBe(false);expect(r.setSuggestions[0].suggestedWeightKg).toBe(80);});
''')
Path('src/store/weeklyCheckin.test.ts').write_text(r'''import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('../lib/storage',()=>({offlineFirstStorage:{getItem:vi.fn().mockResolvedValue(null),setItem:vi.fn().mockResolvedValue(undefined),removeItem:vi.fn().mockResolvedValue(undefined)}}));
vi.mock('../services/cloudSyncService',async original=>{const actual=await original<typeof import('../services/cloudSyncService')>();return {...actual,cloudSyncService:{connect:vi.fn().mockResolvedValue(undefined),capture:vi.fn(),disconnect:vi.fn()}};});
import {useNutritionStore} from './useNutritionStore';import {addDays} from '../lib/dates';
const user={id:'11111111-1111-4111-8111-111111111111',email:'test@example.test',fullName:'Test',authMode:'local_vault' as const};
describe('weekly check-in and complete-day confirmation',()=>{
 beforeEach(async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));useNutritionStore.getState().clearActiveSessionState();await useNutritionStore.getState().initializeForUser(user);useNutritionStore.getState().completeOnboarding({birthDate:'1990-01-01',sex:'male',heightCm:180,weightKg:80,initialPal:1.55,trainingExperience:'intermediate',selectedPhase:'maintenance'});const base=useNutritionStore.getState().biometricLogs[0],dates=Array.from({length:21},(_,i)=>addDays('2026-11-12',i-20));useNutritionStore.setState({biometricLogs:dates.map((date,i)=>({...base,id:`bio${i}`,date,scaleWeightKg:82-i*.05,trendWeightKg:82-i*.05})),timelineLogs:dates.map((date,i)=>({id:`log${i}`,date,hour:12,gramsConsumed:100,calculatedMacros:{kcal:2400,proteinG:150,carbsG:250,fatG:80,fiberG:30}})),completedNutritionDates:dates});});
 afterEach(()=>vi.useRealTimers());
 it('applies once weekly without compounding the damping limit',()=>{const first=useNutritionStore.getState().executeWeeklyMetabolicCheckin(true);expect(first).not.toBeNull();const tdee=useNutritionStore.getState().userProfile?.activeTdee,second=useNutritionStore.getState().executeWeeklyMetabolicCheckin(true);expect(second?.id).toBe(first?.id);expect(useNutritionStore.getState().metabolicCheckins).toHaveLength(1);expect(useNutritionStore.getState().userProfile?.activeTdee).toBe(tdee);});
 it('rejects an adjustment with insufficient complete days',()=>{useNutritionStore.setState({completedNutritionDates:[]});expect(useNutritionStore.getState().executeWeeklyMetabolicCheckin(true)).toBeNull();});
 it('invalidates completeness when food changes and rejects future confirmation',()=>{const date='2026-11-12';useNutritionStore.getState().updateTimelineLogGrams('log20',150);expect(useNutritionStore.getState().completedNutritionDates).not.toContain(date);useNutritionStore.getState().markNutritionDayComplete(date,true);expect(useNutritionStore.getState().completedNutritionDates).toContain(date);useNutritionStore.getState().markNutritionDayComplete('2026-11-13',true);expect(useNutritionStore.getState().completedNutritionDates).not.toContain('2026-11-13');});
});
''')
Path('supabase/migrations/202611120003_domain_consistency.sql').write_text('''BEGIN;
CREATE OR REPLACE FUNCTION public.estimated_1rm_v1(weight_kg numeric,reps integer,set_type text)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path='' AS $$
 SELECT CASE WHEN set_type='warmup' OR reps<=0 OR weight_kg<=0 THEN 0::numeric
 WHEN reps=1 THEN ROUND(weight_kg,1)
 WHEN reps<=10 THEN ROUND(weight_kg/(1.0278-0.0278*reps),1)
 ELSE ROUND(weight_kg*(1+reps/30.0),1) END;
$$;
CREATE OR REPLACE VIEW public.v_workout_set_logs_computed WITH(security_invoker=true) AS
 SELECT s.*,public.estimated_1rm_v1(s.weight_kg,s.reps,s.set_type) AS estimated_1rm FROM public.workout_set_logs s;
-- The application no longer uses this divergent legacy calculator.
REVOKE EXECUTE ON FUNCTION public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text) FROM PUBLIC,anon,authenticated;
COMMIT;
''')
Path('supabase/tests/domain.sql').write_text('''DO $$BEGIN
 IF public.estimated_1rm_v1(100,8,'working')<>124.2 THEN RAISE EXCEPTION 'Brzycki parity';END IF;
 IF public.estimated_1rm_v1(100,12,'working')<>140.0 THEN RAISE EXCEPTION 'Epley parity';END IF;
 IF public.estimated_1rm_v1(100,1,'working')<>100.0 OR public.estimated_1rm_v1(100,8,'warmup')<>0 THEN RAISE EXCEPTION '1RM edge case';END IF;
 IF has_function_privilege('authenticated','public.rpc_compute_daily_targets(text,numeric,numeric,integer,numeric,text)','EXECUTE') THEN RAISE EXCEPTION 'Obsolete calculation RPC exposed';END IF;
END$$;
''')
Path('docs/DOMAIN.md').write_text('''# Contrato de cálculo y calendario

Comidas y pesajes usan fechas civiles locales (`YYYY-MM-DD`); instantes y temporizadores siguen en UTC. La aritmética de días no depende de horario estacional. No se inventan edades para entradas inválidas; el onboarding automático se limita a adultos.

La energía mostrada y persistida es la suma de macros redondeados. Si proteína y grasa exceden el presupuesto inicial, se avisa y se presenta la suma coherente. Esto no constituye validación clínica ni garantiza seguridad individual.

El motor adaptativo alinea pesajes e ingestas en la misma ventana, excluye futuro y exige días confirmados completos. Editar comidas invalida esa confirmación. La imputación puede seguir sesgada por subregistro, hidratación y otros factores; no es medición directa del metabolismo.

Hay una revisión por semana iniciada el lunes, con ID estable por período. Los conflictos multidispositivo requieren elección explícita. TypeScript es la fuente canónica de metas energéticas; se retiraron permisos del RPC divergente. La vista SQL de 1RM replica Brzycki/Epley con pruebas de paridad. La progresión requiere todas las series de trabajo prescritas y sigue siendo una sugerencia, no una prescripción.

Las pruebas cubren calendario, valores inválidos, períodos desalineados, futuro, días parciales, coherencia energética, check-ins repetidos y rutinas incompletas. La revisión clínica y la aceptación en entorno real quedan pendientes.
''')
