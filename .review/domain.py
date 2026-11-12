from pathlib import Path
import re

def patch(name,old,new):
 p=Path(name);s=p.read_text();assert old in s,(name,old[:70]);p.write_text(s.replace(old,new))
Path('src/lib/dates.ts').write_text(r'''/** Civil date arithmetic is independent from device timezone and DST. */
export function localDate(now=new Date()):string {
 if(!Number.isFinite(now.getTime()))throw new RangeError('Fecha inválida.');
 return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function isCivilDate(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const[y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return y>=1000&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
export function dayNumber(value:string):number {
 if(!isCivilDate(value))throw new RangeError('Fecha civil inválida.');return Date.parse(`${value}T00:00:00Z`)/86400000;
}
export function addDays(value:string,amount:number):string {
 if(!Number.isInteger(amount))throw new RangeError('El desplazamiento debe ser entero.');return new Date((dayNumber(value)+amount)*86400000).toISOString().slice(0,10);
}
export const daysBetween=(start:string,end:string):number=>dayNumber(end)-dayNumber(start);
export function weekStart(value=localDate()):string {const day=new Date(dayNumber(value)*86400000).getUTCDay();return addDays(value,-((day+6)%7));}
export function ageOn(birthDate:string,reference=localDate()):number {
 if(!isCivilDate(birthDate)||!isCivilDate(reference)||birthDate>reference)throw new RangeError('Fecha de nacimiento inválida.');
 const[year,month,day]=birthDate.split('-').map(Number),[ry,rm,rd]=reference.split('-').map(Number);
 return ry-year-(rm<month||(rm===month&&rd<day)?1:0);
}
''')
p=Path('src/lib/metabolism.ts');s=p.read_text();s="import { ageOn, localDate, isCivilDate, addDays, daysBetween } from './dates';\n"+s
a=s.index('  const birth = new Date(birthDate);');b=s.index('\n}\n',a);s=s[:a]+"  return ageOn(birthDate, referenceDateStr ?? localDate());"+s[b:]
s=s.replace('  fatFloorApplied: boolean;','  fatFloorApplied: boolean;\n  requestedKcal: number;\n  energyAdjustmentReason: string | null;')
s=s.replace('  // Determinar si el BF% es muy elevado',"  if (![targetKcal, weightKg, lbmKg, bfPercent].every(Number.isFinite) || targetKcal <= 0 || weightKg <= 0 || lbmKg <= 0) throw new RangeError('Datos de macronutrientes inválidos.');\n  if (customProteinPerKg !== undefined && (!Number.isFinite(customProteinPerKg) || customProteinPerKg <= 0)) throw new RangeError('Factor proteico inválido.');\n\n  // Determinar si el BF% es muy elevado")
s=s.replace('const fiberG = Math.round((targetKcal / 1000) * 14);','const fiberG = Math.round((effectiveKcal / 1000) * 14);')
s=s.replace('    kcal: effectiveKcal,','    kcal: effectiveKcal,\n    requestedKcal: targetKcal,\n    energyAdjustmentReason: proteinKcal + fatKcal > targetKcal ? `La meta inicial de ${targetKcal} kcal no permite los macronutrientes calculados. Se muestra su suma coherente (${effectiveKcal} kcal); revisa el plan con un profesional.` : null,')
s=s.replace('Math.max(250, fatMassKg * MAX_LIPOLYSIS_KCAL_PER_KG_FAT)','Math.max(0, fatMassKg * MAX_LIPOLYSIS_KCAL_PER_KG_FAT)')
s=s.replace('  const maxLipolysisDeficitKcal =',"  if (!Number.isFinite(activeTdee) || activeTdee <= 0 || !Number.isFinite(fatMassKg) || fatMassKg < 0) throw new RangeError('Datos energéticos inválidos.');\n  const maxLipolysisDeficitKcal =",1)
s=s.replace('(-(effectiveDeficitKcal / activeTdee))','((targetKcal - activeTdee) / activeTdee)').replace('deltaKcal: -effectiveDeficitKcal,','deltaKcal: targetKcal - activeTdee,')
s=s.replace('(-(desiredDeficitKcal / activeTdee))','((targetKcal - activeTdee) / activeTdee)').replace('deltaKcal: -desiredDeficitKcal,','deltaKcal: targetKcal - activeTdee,')
s=s.replace('  kcal: number | null; // null o 0 si el día quedó vacío (se imputará promedio habitual)','  kcal: number | null;\n  isComplete?: boolean; // Explicit user confirmation; missing is not complete.')
s=s.replace('  windowDays?: number;\n}): AdaptiveTdeeResult','  windowDays?: number;\n  referenceDate?: string;\n}): AdaptiveTdeeResult')
a=s.index('  const sortedWeights =',s.index('export function calculateAdaptiveTdee'));b=s.index('  if (!isReadyForAdaptive) {',a)
s=s[:a]+'''  const referenceDate = params.referenceDate ?? localDate();
  if (!Number.isInteger(windowDays) || windowDays < 14 || windowDays > 90 || !Number.isFinite(previousTdee) || previousTdee <= 0) throw new RangeError('Ventana o gasto previo inválido.');
  const firstAllowedDate = addDays(referenceDate, -(windowDays-1));
  const recentWeights = [...new Map(biometricLogs.filter(b => isCivilDate(b.date) && b.date >= firstAllowedDate && b.date <= referenceDate && Number.isFinite(b.trendWeightKg) && b.trendWeightKg > 0).map(b => [b.date,b])).values()].sort((a,b)=>a.date.localeCompare(b.date));
  const hasEnoughWeights = recentWeights.length >= 2;
  const firstWeightDate = recentWeights[0]?.date ?? firstAllowedDate;
  const lastWeightDate = recentWeights[recentWeights.length-1]?.date ?? referenceDate;
  const daySpanBetweenWeights = hasEnoughWeights ? daysBetween(firstWeightDate,lastWeightDate) : 0;
  // Morning-to-morning weight interval uses intake before the final weigh-in.
  const recentIntakes = [...new Map(dailyIntakes.filter(d => isCivilDate(d.date) && d.date >= firstWeightDate && d.date < lastWeightDate).map(d=>[d.date,d])).values()];
  const validLoggedIntakes = recentIntakes.filter((d): d is DailyNutritionSummary & {kcal:number} => d.isComplete === true && d.kcal !== null && Number.isFinite(d.kcal) && d.kcal > 0);
  const loggedDaysCount = validLoggedIntakes.length;
  const imputedDaysCount = Math.max(0,daySpanBetweenWeights-loggedDaysCount);
  const avgDailyIntakeKcal = loggedDaysCount ? Math.round(validLoggedIntakes.reduce((sum,d)=>sum+d.kcal,0)/loggedDaysCount) : previousTdee;
  const minRequiredLoggedDays = Math.max(8,Math.ceil(daySpanBetweenWeights*4/7));
  const isReadyForAdaptive = hasEnoughWeights && daySpanBetweenWeights >= 13 && loggedDaysCount >= minRequiredLoggedDays && daysBetween(lastWeightDate,referenceDate) <= 3;

'''+s[b:]
s=s.replace('días nutricionales válidos','días nutricionales confirmados completos').replace('// Ecuación exacta: TDEE_Real','// Aproximación de balance energético: TDEE estimado');p.write_text(s)
for name in ['src/store/useNutritionStore.ts','src/services/legacyCloudReader.ts']:
 p=Path(name);s=p.read_text();s=re.sub(r'targetKcal: phaseCal.targetKcal,\n(\s*)targetProteinG:',r'targetKcal: macros.kcal,\n\1targetAdjustmentReason: macros.energyAdjustmentReason ?? undefined,\n\1targetProteinG:',s);p.write_text(s)
patch('src/types/nutrition.ts','  targetKcal: number;','  targetKcal: number;\n  targetAdjustmentReason?: string;')
p=Path('src/store/useNutritionStore.ts');s="import { localDate, addDays, weekStart, isCivilDate } from '../lib/dates';\n"+p.read_text()
s=s.replace('const getTodayIso = () => new Date().toISOString().slice(0, 10);','const getTodayIso = localDate;')
s=s.replace('  deletedRecordIds: string[];','  deletedRecordIds: string[];\n  completedNutritionDates: string[];')
s=s.replace('  setSelectedDate: (date: string) => void;','  setSelectedDate: (date: string) => void;\n  markNutritionDayComplete: (date: string, complete: boolean) => void;')
s=s.replace('    deletedRecordIds: Array.from(deletedSet),','    deletedRecordIds: Array.from(deletedSet),\n    completedNutritionDates: Array.isArray(raw?.completedNutritionDates) ? raw.completedNutritionDates.filter(isCivilDate) : [],')
s=s.replace('    deletedRecordIds: state.deletedRecordIds,','    deletedRecordIds: state.deletedRecordIds,\n    completedNutritionDates: state.completedNutritionDates,')
s=s.replace('  deletedRecordIds: [],','  deletedRecordIds: [],\n  completedNutritionDates: [],')
s=s.replace('      deletedRecordIds: localSnapshot.deletedRecordIds,','      deletedRecordIds: localSnapshot.deletedRecordIds,\n      completedNutritionDates: localSnapshot.completedNutritionDates,')
s=s.replace('        deletedRecordIds: remote.deletedRecordIds });','        deletedRecordIds: remote.deletedRecordIds, completedNutritionDates: remote.completedNutritionDates ?? [] });')
s=s.replace('    const age = calculateAgeFromBirthDate(payload.birthDate);','    const age = calculateAgeFromBirthDate(payload.birthDate);\n    if (age < 18 || age > 100) throw new RangeError(\'El plan automático está limitado a personas adultas.\');')
s=s.replace('    const targetDate = payload.date || getTodayIso();','    const targetDate = payload.date || getTodayIso();\n    if (!isCivilDate(targetDate) || targetDate > getTodayIso() || !Number.isFinite(payload.scaleWeightKg) || payload.scaleWeightKg < 30 || payload.scaleWeightKg > 250) throw new RangeError(\'Pesaje inválido.\');')
a=s.index('    const allKnownDates =');b=s.index('    const dailyIntakes =',a);s=s[:a]+'''    const anchorDateStr = getTodayIso();
    const recentDates = Array.from({length:21},(_,i)=>addDays(anchorDateStr,i-20));

'''+s[b:]
s=s.replace('return { date, kcal: totalKcal > 0 ? totalKcal : null };','return { date, kcal: totalKcal > 0 ? totalKcal : null, isComplete: state.completedNutritionDates.includes(date) };')
s=s.replace('      windowDays: 21,','      windowDays: 21,\n      referenceDate: anchorDateStr,')
s=s.replace('    if (!adaptiveStatus) return null;\n\n    const today = getTodayIso();','    if (!adaptiveStatus?.isReadyForAdaptive) return null;\n\n    const today = getTodayIso();\n    const period = weekStart(today);\n    const existing = state.metabolicCheckins.find(c => weekStart(c.weekDate) === period);\n    if (existing) return existing;')
s=s.replace('    const checkin: MetabolicCheckin = {\n      id: generateUuid(),\n      weekDate: today,','    const checkin: MetabolicCheckin = {\n      id: `checkin-${period}`,\n      weekDate: period,')
s=s.replace('  setSelectedDate: (date) => set({ selectedDate: date }),', '''  setSelectedDate: (date) => { if (isCivilDate(date)) set({ selectedDate: date }); },
  markNutritionDayComplete: (date, complete) => {
    const state=get();
    if (!isCivilDate(date)||date>getTodayIso()||!state.timelineLogs.some(l=>l.date===date)) return;
    set({completedNutritionDates: complete ? Array.from(new Set([...state.completedNutritionDates,date])) : state.completedNutritionDates.filter(d=>d!==date)});
    persistCurrentUserState(get());
  },''')
s=s.replace('      timelineLogs: [...state.timelineLogs, newLog],','      timelineLogs: [...state.timelineLogs, newLog],\n      completedNutritionDates: state.completedNutritionDates.filter(d=>d!==targetDate),')
s=s.replace('    set({ timelineLogs: updated });','    set({ timelineLogs: updated, completedNutritionDates: state.completedNutritionDates.filter(d=>d!==state.timelineLogs.find(l=>l.id===logId)?.date) });')
s=s.replace('      timelineLogs: state.timelineLogs.filter((l) => l.id !== logId),','      timelineLogs: state.timelineLogs.filter((l) => l.id !== logId),\n      completedNutritionDates: state.completedNutritionDates.filter(d=>d!==state.timelineLogs.find(l=>l.id===logId)?.date),')
s=s.replace('      timelineLogs: [...state.timelineLogs, ...clonedLogs],','      timelineLogs: [...state.timelineLogs, ...clonedLogs],\n      completedNutritionDates: state.completedNutritionDates.filter(d=>!targetDates.includes(d)),');p.write_text(s)
p=Path('src/services/sync/snapshot.ts');s=p.read_text().replace('favoriteFoodIds:snapshot.favoriteFoodIds','favoriteFoodIds:snapshot.favoriteFoodIds,completedNutritionDates:snapshot.completedNutritionDates')
a=s.index("else if(doc.kind==='preferences')");b=s.index('\n',a)
s=s[:a]+"else if(doc.kind==='preferences'){next.favoriteFoodIds=Array.isArray(doc.value.favoriteFoodIds)?doc.value.favoriteFoodIds.filter((id):id is string=>typeof id==='string'):[];next.completedNutritionDates=Array.isArray(doc.value.completedNutritionDates)?doc.value.completedNutritionDates.filter((d):d is string=>typeof d==='string'):[];}"+s[b:];p.write_text(s)
patch('src/lib/strengthAnalytics.ts','referenceSets.length > 0 && referenceSets.every((s) => s.reps >= maxReps);','lastWorkingSets.length >= targetSets && lastWorkingSets.every((s) => s.reps >= maxReps && Number.isFinite(s.weightKg) && s.weightKg > 0);')
p=Path('src/lib/strengthAnalytics.ts');s=p.read_text().replace('weightKg <= 0 || reps <= 0','!Number.isFinite(weightKg) || !Number.isFinite(reps) || weightKg <= 0 || reps <= 0',1);p.write_text(s)
for name,imp in [('src/components/dashboard/NutritionDashboard.tsx',"import { localDate } from '../../lib/dates';\n"),('src/components/onboarding/BiometricCheckinView.tsx',"import { localDate, weekStart } from '../../lib/dates';\n")]:
 p=Path(name);s=imp+p.read_text();s=s.replace('new Date().toISOString().slice(0, 10)','localDate()').replace('d.toISOString().slice(0, 10)','localDate(d)');p.write_text(s)
p=Path('src/components/dashboard/NutritionDashboard.tsx');s=p.read_text().replace('  const userProfile =',"  const completedDates = useNutritionStore(s=>s.completedNutritionDates);\n  const markComplete = useNutritionStore(s=>s.markNutritionDayComplete);\n  const userProfile =",1)
s=s.replace('      {/* ====================================================================\n          RESUMEN SIMPLE DEL DÍA','      <div className="rounded-xl border bg-white p-3 text-sm" role="status">\n        <span>{completedDates.includes(selectedDate) ? \'Día confirmado completo para el cálculo adaptativo.\' : \'Registro parcial: no se usará como día completo en el cálculo adaptativo.\'}</span>\n        <button type="button" className="ml-3 underline" disabled={selectedDate > localDate() || dayLogs.length === 0} onClick={() => markComplete(selectedDate, !completedDates.includes(selectedDate))}>{completedDates.includes(selectedDate) ? \'Marcar como parcial\' : \'Confirmar que registré todo el día\'}</button>\n      </div>\n      {/* ====================================================================\n          RESUMEN SIMPLE DEL DÍA');p.write_text(s)
p=Path('src/components/onboarding/BiometricCheckinView.tsx');s=p.read_text().replace('  const userProfile =',"  const timelineLogs = useNutritionStore(s=>s.timelineLogs);\n  const completeDates = useNutritionStore(s=>s.completedNutritionDates);\n  const checkins = useNutritionStore(s=>s.metabolicCheckins);\n  const alreadyApplied = checkins.some(c=>weekStart(c.weekDate)===weekStart());\n  const userProfile =",1)
s=s.replace('[computeCurrentAdaptiveTdeeStatus, biometricLogs, userProfile]','[computeCurrentAdaptiveTdeeStatus, biometricLogs, userProfile, timelineLogs, completeDates]')
s=s.replace('onClick={handleApplyAdaptiveTdee}','onClick={handleApplyAdaptiveTdee}\n                      disabled={alreadyApplied}')
s=s.replace('<span>Actualizar mis calorías de la semana</span>',"<span>{alreadyApplied ? 'Revisión semanal ya registrada' : 'Actualizar mis calorías de la semana'}</span>")
s=s.replace('if (!Number.isFinite(scaleWeight) || scaleWeight < 30 || scaleWeight > 250)','if (logDate > localDate() || !Number.isFinite(scaleWeight) || scaleWeight < 30 || scaleWeight > 250)')
for a,b in [('Tu Peso Promedio Real','Tu Tendencia de Peso Estimada'),('Sin variaciones de agua del día a día','Suavizado orientativo; no distingue agua de otros cambios'),('Peso Real (Promedio)','Tendencia de peso (estimada)'),('tu cuerpo quema','el modelo estima un gasto de'),('Gráfica de tu Progreso Real','Gráfica de tu Progreso'),('tendencia real','tendencia estimada'),('calorías reales automáticamente','calorías estimadas con tu confirmación'),('promedio real','promedio suavizado')]:s=s.replace(a,b)
p.write_text(s)
p=Path('src/components/onboarding/OnboardingDiagnostic.tsx');s=p.read_text().replace('() => (birthDate ? calculateAgeFromBirthDate(birthDate) : null),','() => { try { return birthDate ? calculateAgeFromBirthDate(birthDate) : null; } catch { return null; } },')
s=s.replace('if (!isBasicDataComplete || age === null) return null;','if (!isBasicDataComplete || age === null || age < 18 || age > 100) return null;')
s=s.replace('    if (!birthDate) {','    if (!birthDate || age === null || age < 18 || age > 100) {').replace('Ingresa tu fecha de nacimiento en el Paso 1 para calcular tu gasto energético real.','Ingresa una fecha válida. El plan automático está limitado a personas adultas de 18 a 100 años.')
s=s.replace('              {/* Resumen Final de tu Plan Diario */}', '''              <p className="rounded-xl bg-amber-50 p-3 text-sm" role="note">Estas cifras son estimaciones orientativas, no un diagnóstico ni una prescripción. Revisa el plan con un profesional si tienes condiciones médicas, embarazo o necesidades particulares.</p>
              {hierarchicalMacros.energyAdjustmentReason && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{hierarchicalMacros.energyAdjustmentReason}</p>}
              {/* Resumen Final de tu Plan Diario */}''');p.write_text(s)
p=Path('src/lib/metabolism.test.ts');s=p.read_text().replace('kcal: idx % 7 === 0 ? null : 2400,','isComplete: idx % 7 !== 0,\n      kcal: idx % 7 === 0 ? null : 2400,').replace('      previousTdee: 2500,','      previousTdee: 2500,\n      referenceDate: \'2026-10-21\',');p.write_text(s)
