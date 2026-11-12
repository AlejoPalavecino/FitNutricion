from pathlib import Path
import re,json

def write(name,text):
 p=Path(name);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
def change(name,old,new):
 p=Path(name);s=p.read_text();assert old in s or new in s,(name,old[:60]);p.write_text(s.replace(old,new))
change('src/components/gym/OpenGymHub.tsx','import React, { useEffect, useMemo, useState }','import React, { useCallback, useEffect, useMemo, useState }')
p=Path('src/components/onboarding/OnboardingDiagnostic.tsx');s=p.read_text();s=re.sub(r'<label\s+htmlFor="onboardingdiagnostic-field-3"(\s+className="[^"]*")\s*>\s*Sexo biológico\s*</label>',r'<p\1>Sexo biológico</p>',s);p.write_text(s)
p=Path('src/components/navigation/PwaStatus.tsx');s=p.read_text().replace('const activeWorkout = useNutritionStore((s) => s.activeWorkoutDraft);',"const activeWorkout = useNutritionStore((s) => !!s.activeWorkoutDraft && Object.values(s.activeWorkoutDraft.setsByExercise).some(sets=>sets.some(set=>set.isCompleted))); ");p.write_text(s)
p=Path('public/manifest.json');data=json.loads(p.read_text());data.update({'id':'/','scope':'/','lang':'es'});data['icons'][0]['sizes']='1024x1024';data['icons'][0]['purpose']='any';p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
p=Path('vite.config.ts');s="import {readFileSync} from 'node:fs';\n"+p.read_text();s=s.replace('  plugins: [react(), tailwindcss()],',"  plugins: [react(), tailwindcss()],\n  preview: {headers:Object.fromEntries(JSON.parse(readFileSync(path.resolve(__dirname,'vercel.json'),'utf8')).headers[0].headers.map((h:{key:string;value:string})=>[h.key,h.value]))},");p.write_text(s)
# Stable random IDs for all newly created records, not clock-based collisions.
for filename in ['src/components/gym/OpenGymHub.tsx','src/components/dashboard/NutritionDashboard.tsx','src/components/navigation/QuickActionCommand.tsx','src/store/slices/nutrition.ts','src/store/slices/workouts.ts','src/store/slices/profile.ts']:
 p=Path(filename);s=p.read_text();s=s.replace('${Date.now()}','${generateUuid()}')
 if 'generateUuid' in s and not re.search(r'import[\s\S]*?generateUuid[\s\S]*?from',s[:s.find('export ')]):
  s="import {generateUuid} from '../../lib/ids';\n"+s
 p.write_text(s)
# Local-vs-local conflicts must not fabricate server acknowledgements.
p=Path('src/services/sync/engine.ts');s=p.read_text().replace('  conflict?: Document;','  conflict?: Document;\n  localPredecessorId?: string;')
s=s.replace('          conflict,\n','          conflict,\n          localPredecessorId: conflict ? previous?.id : undefined,\n')
s=s.replace('        if (current) op.conflict = current;','        if (current) {op.conflict = current;op.localPredecessorId=previous?.id;}')
s=s.replace('        if (op.conflict && j.documents[key]) op.conflict = j.documents[key];','''        if(op.localPredecessorId && !j.operations.some(other=>other.id===op.localPredecessorId)) delete op.localPredecessorId;
        if (op.conflict && !op.localPredecessorId && j.documents[key]) op.conflict = j.documents[key];''')
s=s.replace('      const desired = chain[chain.length - 1];','''      const desired = chain[chain.length - 1];
      const index=chain.findIndex(op=>op.id===id);
      if(conflict.localPredecessorId && chain.some(op=>op.id===conflict.localPredecessorId)){
        const earlier=chain.slice(0,index);
        j.operations=j.operations.filter(op=>documentId(op)!==key);
        j.operations.push(...earlier);
        if(choice==='local')j.operations.push({kind:desired.kind,key:desired.key,value:desired.value,id:generateUuid(),baseVersion:earlier[earlier.length-1].baseVersion+1,attempts:0,retryAt:0});
        return;
      }''');p.write_text(s)
p=Path('src/components/navigation/SyncStatusBanner.tsx');s=p.read_text().replace('Usar versión del servidor','Conservar la otra versión').replace('¿Descartar tu cambio pendiente y usar la versión del servidor?','¿Descartar este cambio y conservar la versión anterior mostrada por la sincronización?');p.write_text(s)
p=Path('src/services/sync/engine.test.ts');p.write_text(p.read_text()+r'''
for(const choice of ['local','remote'] as const)it(`resolves conflicting offline tabs (${choice}) without inventing a server record`,async()=>{
 const backend=server(),a=new SyncEngine(memory(),backend.gateway);
 await a.enqueue([{...food('first tab'),previous:null}]);
 await a.enqueue([{...food('second tab'),previous:null}]);
 const before=await a.read();expect(before.operations[1].localPredecessorId).toBe(before.operations[0].id);
 await a.resolve(before.operations[1].id,choice);
 expect(Object.keys((await a.read()).documents)).toHaveLength(0);
 expect((await a.read()).operations.length).toBe(choice==='local'?2:1);
 await a.synchronize();expect(backend.docs.get('food:off-123')?.value?.name).toBe(choice==='local'?'second tab':'first tab');
});
''')
# Validate custom food entries explicitly, including fiber; blank is not zero.
p=Path('src/components/dashboard/NutritionDashboard.tsx');s=p.read_text();s=s.replace("  const [customFat100, setCustomFat100] = useState<number | ''>('');","  const [customFat100, setCustomFat100] = useState<number | ''>('');\n  const [customFiber100, setCustomFiber100] = useState<number | ''>('');")
s=s.replace("if (!customFoodName.trim() || customKcal100 === '') return;","if (!customFoodName.trim() || [customKcal100,customProtein100,customCarbs100,customFat100,customFiber100].some(value=>value===''||!Number.isFinite(value)||Number(value)<0)||!Number.isFinite(customServingGrams)||customServingGrams<=0){setFoodSearchMessage('Completa todos los nutrientes con datos de la etiqueta; usa cero solo cuando el valor sea cero.');return;}")
s=s.replace('                    fiberPer100g: 0,','                    fiberPer100g: Number(customFiber100),').replace("                  setCustomFat100('');","                  setCustomFat100('');\n                  setCustomFiber100('');")
needle='''                </div>
                <button
                  type="submit"'''
s=s.replace(needle,'''                  <input aria-label="Fibra por 100 g" type="number" required min={0} step="any" value={customFiber100} onChange={e=>setCustomFiber100(e.target.value===''?'':Number(e.target.value))} placeholder="Fibra (g)" className="rounded-xl border bg-white px-3 py-2 text-xs"/>
                </div>
                <button
                  type="submit"''',1)
# Placeholder text alone is not an accessible label.
s=re.sub(r'<input(?![^>]*aria-label)([^>]*?)placeholder="([^"]+)"',lambda m:f'<input aria-label="{m[2]}"{m[1]}placeholder="{m[2]}"',s)
p.write_text(s)
# Prevent non-finite edits from corrupting a persisted workout draft.
p=Path('src/components/gym/OpenGymHub.tsx');s=p.read_text().replace("const updated = { ...s, [field]: Math.max(0, value) };","if(!Number.isFinite(value))return s;\n          const updated = { ...s, [field]: Math.max(0, field==='reps'?Math.trunc(value):value) };")
s=s.replace('''                                      <input
                                        type="number"
                                        min={0}
                                        step={0.5}''','''                                      <input
                                        aria-label={`Peso, serie ${s.setNumber}, ${exItem.nameEs}`}
                                        type="number"
                                        min={0}
                                        step={0.5}''')
s=s.replace('''                                      <input
                                        type="number"
                                        min={0}
                                        step={1}''','''                                      <input
                                        aria-label={`Repeticiones, serie ${s.setNumber}, ${exItem.nameEs}`}
                                        type="number"
                                        min={0}
                                        step={1}''')
p.write_text(s)
# Extract the exercise dialog and provide focus containment/restoration.
write('src/components/useDialogFocus.ts',r'''import {useEffect,useRef} from 'react';
export function useDialogFocus(open:boolean,onClose:()=>void){
 const panel=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;
 const focusable=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length);
 focusable()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}if(event.key==='Tab'){const elements=focusable(),first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
 document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[open]);return panel;
}
''')
p=Path('src/components/gym/OpenGymHub.tsx');s=p.read_text();a=s.index('      <AnimatePresence>\n        {detailModalExercise &&');b=s.index('\n      <RestTimer',a);jsx=s[a:b]
s=s[:a]+'''      <ExerciseDetailDialog detailModalExercise={detailModalExercise} detailModalTab={detailModalTab} setDetailModalExercise={setDetailModalExercise} setDetailModalTab={setDetailModalTab} workoutSessions={workoutSessions}/>
'''+s[b:];s="import {ExerciseDetailDialog} from './ExerciseDetailDialog';\n"+s;p.write_text(s)
jsx=jsx.replace('''            <motion.div
              initial''','''            <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={detailModalExercise.nameEs}
              initial''',1).replace('''                  onClick={() => setDetailModalExercise(null)}''','''                  aria-label="Cerrar detalle del ejercicio"
                  onClick={() => setDetailModalExercise(null)}''')
write('src/components/gym/ExerciseDetailDialog.tsx',"import {AnimatePresence,motion} from 'framer-motion';\nimport {X} from 'lucide-react';\nimport type {ExerciseCatalogItem,WorkoutSession} from '../../types/nutrition';\nimport {useDialogFocus} from '../useDialogFocus';\ninterface Props{detailModalExercise:ExerciseCatalogItem|null;detailModalTab:'demo'|'history';setDetailModalExercise:(exercise:ExerciseCatalogItem|null)=>void;setDetailModalTab:(tab:'demo'|'history')=>void;workoutSessions:WorkoutSession[]}\nexport function ExerciseDetailDialog({detailModalExercise,detailModalTab,setDetailModalExercise,setDetailModalTab,workoutSessions}:Props){const dialogRef=useDialogFocus(!!detailModalExercise,()=>setDetailModalExercise(null));return <>\n"+jsx+'\n</>;}\n')
p=Path('src/components/navigation/QuickActionCommand.tsx');s=p.read_text();a=s.index('  const dialogRef =');b=s.index('  if (!isOpen) return null;',a);s=s[:a]+'  const dialogRef = useDialogFocus(isOpen,onClose);\n'+s[b:];s="import {useDialogFocus} from '../useDialogFocus';\n"+s;s=s.replace('<input\n','<input aria-label="Buscar alimentos o ejercicios"\n',1);p.write_text(s)
# Weekly training windows use the same civil calendar contract as nutrition.
p=Path('src/lib/strengthAnalytics.ts');s="import {localDate,addDays,isCivilDate} from './dates';\n"+p.read_text();s=s.replace('  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();\n  const cutoffTime = refDate.getTime() - (daysWindow - 1) * 24 * 60 * 60 * 1000;',"  const referenceDate=referenceDateStr??localDate();\n  if(!Number.isInteger(daysWindow)||daysWindow<1)throw new RangeError('Ventana inválida.');\n  const cutoffDate=addDays(referenceDate,-(daysWindow-1));")
s=s.replace('    const sessionTime = new Date(session.date).getTime();\n    if (sessionTime < cutoffTime || sessionTime > refDate.getTime() + 86400000) {','    if (!isCivilDate(session.date)||session.date<cutoffDate||session.date>referenceDate) {');p.write_text(s)
write('src/services/passwordRecovery.test.ts',r'''import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({reset:vi.fn(),update:vi.fn()}));
vi.mock('./supabaseClient',()=>({supabase:{auth:{resetPasswordForEmail:mocks.reset,updateUser:mocks.update}}}));
import {requestPasswordRecovery,replaceRecoveredPassword} from './passwordRecovery';
beforeEach(()=>{vi.stubGlobal('window',{location:{origin:'https://example.test'}});mocks.reset.mockResolvedValue({error:null});mocks.update.mockResolvedValue({error:null});});afterEach(()=>vi.unstubAllGlobals());
it('normalizes email and redirects to the configured app origin',async()=>{await expect(requestPasswordRecovery(' User@Example.com ')).resolves.toContain('Si existe');expect(mocks.reset).toHaveBeenCalledWith('user@example.com',{redirectTo:'https://example.test/?recovery=1'});});
it('rejects invalid emails before a network request',async()=>{await expect(requestPasswordRecovery('bad')).rejects.toThrow();expect(mocks.reset).not.toHaveBeenCalled();});
it('validates the replacement password before submitting',async()=>{await expect(replaceRecoveredPassword('tiny')).rejects.toThrow();expect(mocks.update).not.toHaveBeenCalled();await replaceRecoveredPassword('Testing12345!');expect(mocks.update).toHaveBeenCalledWith({password:'Testing12345!'});});
it('does not expose raw backend errors',async()=>{mocks.update.mockResolvedValue({error:new Error('secret internal detail')});await expect(replaceRecoveredPassword('Testing12345!')).rejects.not.toThrow('secret internal detail');});
''')
p=Path('tests/e2e/app.spec.ts');p.write_text(p.read_text()+r'''
async function onboard(page:Page){
 await register(page);await page.getByLabel('Fecha de nacimiento',{exact:true}).fill('1995-06-15');
 await page.getByLabel('Altura (cm)',{exact:true}).fill('180');await page.getByLabel('Peso actual (kg)',{exact:true}).fill('80');
 await page.getByRole('button',{name:'Guardar mi Plan y Empezar'}).click();
 await expect(page.getByRole('button',{name:'Crear mi primera rutina'})).toBeVisible();
}
test('quick actions trap keyboard focus and restore it on Escape',async({page})=>{
 await onboard(page);const trigger=page.getByRole('button',{name:'Buscar comida o ejercicio...'});await trigger.click();
 const dialog=page.getByRole('dialog',{name:'Añadir rápido'});await expect(dialog).toBeVisible();
 await expect(dialog.locator('input').first()).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(trigger).toBeFocused();
});
test('two workouts preserve distinct set identities and historical loads',async({page})=>{
 await onboard(page);await page.getByRole('button',{name:'Crear mi primera rutina'}).click();
 await page.getByLabel('Nombre de la rutina',{exact:true}).fill('Prueba de historial');
 await page.getByRole('button',{name:'Agregar a la rutina',exact:true}).click();
 await page.getByRole('button',{name:'Guardar Rutina',exact:true}).click();
 await page.getByRole('button',{name:'Entrenar Hoy',exact:true}).click();
 await page.getByRole('spinbutton',{name:/^Peso, serie 1,/}).first().fill('40');
 await page.getByRole('button',{name:'Marcar',exact:true}).first().click();await page.getByRole('button',{name:'Guardar Entrenamiento',exact:true}).click();
 await page.getByRole('spinbutton',{name:/^Peso, serie 1,/}).first().fill('45');
 await page.getByRole('button',{name:'Marcar',exact:true}).first().click();await page.getByRole('button',{name:'Guardar Entrenamiento',exact:true}).click();
 const snapshot=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('fitnutricion-user-data-v2:'))!;const envelope=JSON.parse(localStorage.getItem(key)!);return JSON.parse(envelope.value);});
 expect(snapshot.workoutSessions).toHaveLength(2);expect(snapshot.workoutSessions.map((s:{sets:{weightKg:number}[]})=>s.sets[0].weightKg).sort()).toEqual([40,45]);
 expect(new Set(snapshot.workoutSessions.map((s:{sets:{id:string}[]})=>s.sets[0].id)).size).toBe(2);
 await page.reload();await expect(page.getByRole('button',{name:'Entrenar Hoy',exact:true})).toBeVisible();
});
''')
# Correct a broad muscle-name match without changing curated clinical content.
p=Path('scripts/ingest-opengym.ts');s=p.read_text().replace("m.includes('lat')",r"/\b(lats?|latissimus)\b/.test(m)");p.write_text(s)
