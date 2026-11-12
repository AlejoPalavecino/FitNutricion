from pathlib import Path
import os,runpy,subprocess
assert os.environ['GITHUB_REF_NAME']=='improvements/stage-2-reliable-sync'
runpy.run_path('.review/sync_files.py')
runpy.run_path('.review/database.py')
runpy.run_path('.review/sync_tests.py')
transform=r'''const ts=require('typescript'),fs=require('fs');
const p='src/store/useNutritionStore.ts';let source=fs.readFileSync(p,'utf8');
const tree=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true),removals=[];
function visit(node){if(ts.isIfStatement(node)&&/^(state\.activeUserId|activeUserId)/.test(node.expression.getText(tree))&&node.getText(tree).includes('cloudSyncService.')){removals.push([node.getStart(tree),node.end]);return;}ts.forEachChild(node,visit);}
visit(tree);for(const[start,end]of removals.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+source.slice(end);
source=source.replace('interface PersistedUserSnapshot {','export interface PersistedUserSnapshot {');
source=source.replace('function persistCurrentUserState(state: NutritionState): void {','function snapshotFromState(state: NutritionState): PersistedUserSnapshot {');
source=source.replace('  if (!state.activeUserId) return;\n  const baseFoodIds','  const baseFoodIds');
const start=source.indexOf('  void Promise.resolve(offlineFirstStorage.setItem('),end=source.indexOf('\nexport const useNutritionStore',start);
if(start<0||end<start)throw new Error('Persistence guard failed');
source=source.slice(0,start)+`  return snapshot;
}
function persistCurrentUserState(state: NutritionState, capture = true): void {
  if (!state.activeUserId) return;
  const snapshot = snapshotFromState(state);
  void Promise.resolve(offlineFirstStorage.setItem(getUserStorageKey(state.activeUserId), JSON.stringify(snapshot))).catch(reportLocalFailure);
  if (capture) cloudSyncService.capture(state.activeUserId, snapshot);
}
`+source.slice(end);
const newStart=source.indexOf('    if (isNewRegistration) {'),newEnd=source.indexOf('    // Limpiar en memoria',newStart);
if(newStart<0||newEnd<newStart)throw new Error('Registration guard failed');source=source.slice(0,newStart)+source.slice(newEnd);
const cloudStart=source.indexOf('    // Si Supabase Cloud está activo'),cloudEnd=source.indexOf('\n  clearActiveSessionState:',cloudStart);
if(cloudStart<0||cloudEnd<cloudStart)throw new Error('Hydration guard failed');
source=source.slice(0,cloudStart)+`    await cloudSyncService.connect(user, snapshotFromState(get()), (remote) => {
      if (generation !== sessionGeneration || get().activeUserId !== user.id) return;
      const favorites = new Set(remote.favoriteFoodIds);
      set({ userProfile: remote.userProfile,
        biometricLogs: recalculateBiometricTrends(remote.biometricLogs, remote.userProfile?.ewmaAlpha ?? 0.12),
        foods: [...remote.customFoods, ...INITIAL_FOOD_ITEMS.map((f) => ({ ...f, isFavorite: favorites.has(f.id) }))],
        recipes: [...remote.customRecipes, ...INITIAL_RECIPES],
        exerciseCatalog: [...remote.customExercises, ...OPENGYM_EXERCISE_CATALOG],
        timelineLogs: remote.timelineLogs, metabolicCheckins: remote.metabolicCheckins,
        workoutRoutines: remote.workoutRoutines, workoutSessions: remote.workoutSessions,
        deletedRecordIds: remote.deletedRecordIds });
      persistCurrentUserState(get(), false);
    });
    if (generation === sessionGeneration) persistCurrentUserState(get(), false);
  },
`+source.slice(cloudEnd);
source=source.replace('  clearActiveSessionState: () => {\n','  clearActiveSessionState: () => {\n    cloudSyncService.disconnect();\n');
fs.writeFileSync(p,source.split('\n').map(line=>line.trimEnd()).join('\n'));
'''
Path('.review/transform.cjs').write_text(transform)
subprocess.run(['node','.review/transform.cjs'],check=True)
p=Path('src/store/useAuthStore.ts');s=p.read_text();s="import { cloudSyncService } from '../services/cloudSyncService';\n"+s
s=s.replace('    await authService.logout(wipeDeviceData);','    await cloudSyncService.drain();\n    cloudSyncService.disconnect();\n    await authService.logout(wipeDeviceData);');p.write_text(s)
p=Path('src/store/useSyncStatusStore.ts');s=p.read_text().replace('  conflicts: number;','  conflicts: number;\n  conflictItems: Array<{ id: string; kind: string; key: string }>;')
s=s.replace('const initial = {','const initial = { conflictItems: [] as Array<{ id: string; kind: string; key: string }>,');p.write_text(s)
p=Path('src/components/navigation/SyncStatusBanner.tsx');s=p.read_text();s="import { cloudSyncService } from '../../services/cloudSyncService';\n"+s
s=s.replace('{message}</div>;',r'''{message}
    {state.pendingOperations > 0 && <button type="button" className="ml-3 underline" onClick={() => void cloudSyncService.retry()}>Reintentar</button>}
    {state.conflictItems.map((item) => <div key={item.id} className="mt-2 rounded border p-2">
      <span>Conflicto en {item.kind}. La copia local se conserva hasta que elijas.</span>
      <button type="button" className="ml-3 underline" onClick={() => { if (window.confirm('¿Reemplazar este registro remoto por tu copia local?')) void cloudSyncService.resolveConflict(item.id, 'local'); }}>Conservar mi cambio</button>
      <button type="button" className="ml-3 underline" onClick={() => { if (window.confirm('¿Descartar tu cambio pendiente y usar la versión del servidor?')) void cloudSyncService.resolveConflict(item.id, 'remote'); }}>Usar versión del servidor</button>
    </div>)}
  </div>;''');p.write_text(s)
